import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Save, Settings, Info, CheckCircle2, Download, LogOut, ChevronRight, User, Calendar } from 'lucide-react';

/**
 * Nine Dots Task Cognitive Experiment
 */

type Group = 'CONTROL' | 'INERTIA' | 'MIRROR';
type SurveyData = {
  solvedBefore?: string;
  insight?: string;
  Удовольствие?: number;
  Удивление?: number;
  Внезапность?: number;
  Облегчение?: number;
  Уверенность?: number;
  Драйв?: number;
  gender?: string;
  age?: string;
};

type RawPoint = {
  x: number;
  y: number;
  t: number;
  isInverted?: boolean;
};

type TrialRecord = {
  trialNumber: number;
  group: Group;
  points: RawPoint[];
  trialDuration: number;
  inertiaStep?: number;
  inertiaInc?: number;
  inertiaSmoothing?: number;
  mirrorSize?: number;
  mirrorThickness?: number;
  mirrorDuration?: number;
};

const NINE_DOTS_SPACING = 116;
const NINE_DOTS_PADDING = 50;
const NINE_DOTS_SIZE = NINE_DOTS_SPACING * 2 + NINE_DOTS_PADDING * 2;
const DOT_RADIUS = 23.5;
const BRUSH_COLOR = '#ff0000';
const BRUSH_WIDTH = 4;

const App: React.FC = () => {
  const [appState, setAppState] = useState<'SELECT' | 'TRAINING' | 'INSTRUCTION' | 'TASK' | 'TIMEOUT_INFO' | 'SURVEY' | 'FINISHED' | 'EXPORT'>('SELECT');
  const [finishReason, setFinishReason] = useState<'TIMEOUT' | 'EARLY' | null>(null);
  const [taskStartTime, setTaskStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0); 
  const [trainingStep, setTrainingStep] = useState(1);
  const [surveyStep, setSurveyStep] = useState(0);
  const [surveyData, setSurveyData] = useState<SurveyData>({});
  const [selectedGroup, setSelectedGroup] = useState<Group>('CONTROL');
  const [allTrials, setAllTrials] = useState<TrialRecord[]>([]);
  const [totalTaskTime, setTotalTaskTime] = useState(0);
  const [currentTrialNumber, setCurrentTrialNumber] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Inertia Parameters
  const [inertiaStep, setInertiaStep] = useState(5);
  const [inertiaInc, setInertiaInc] = useState(0.20);
  const [inertiaSmoothing, setInertiaSmoothing] = useState(0.50);

  // Mirror Parameters
  const [mirrorSize, setMirrorSize] = useState(580); 
  const [mirrorThickness, setMirrorThickness] = useState(100);
  const [mirrorDuration, setMirrorDuration] = useState(350);
  const [mirrorVisible, setMirrorVisible] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  
  // Ref-based state for drawing logic
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokePointsRef = useRef<RawPoint[]>([]);
  
  // Mouse state
  const lastActualPosRef = useRef<{ x: number, y: number } | null>(null);
  const lastVirtualPosRef = useRef<{ x: number, y: number } | null>(null);
  
  // Inertia local state
  const cumulativeDistanceRef = useRef(0);
  const currentSensitivityRef = useRef(1.0);
  const lastDeltaRef = useRef({ dx: 0, dy: 0 });

  // Mirror local state
  const inversionEndTimeRef = useRef(0);
  const trialStartTimeRef = useRef(0);

  useEffect(() => {
    let interval: any;
    if (appState === 'TASK' && taskStartTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const seconds = Math.floor((now - taskStartTime) / 1000);
        setElapsedTime(seconds);
        if (seconds >= 900) { 
          const duration = now - trialStartTimeRef.current;
          const points = [...currentStrokePointsRef.current];
          setAllTrials(prev => [...prev, { 
            trialNumber: currentTrialNumber, 
            group: selectedGroup, 
            points,
            trialDuration: duration,
            inertiaStep: selectedGroup === 'INERTIA' ? inertiaStep : undefined,
            inertiaInc: selectedGroup === 'INERTIA' ? inertiaInc : undefined,
            inertiaSmoothing: selectedGroup === 'INERTIA' ? inertiaSmoothing : undefined,
            mirrorSize: selectedGroup === 'MIRROR' ? mirrorSize : undefined,
            mirrorThickness: selectedGroup === 'MIRROR' ? mirrorThickness : undefined,
            mirrorDuration: selectedGroup === 'MIRROR' ? mirrorDuration : undefined
          }]);

          setFinishReason('TIMEOUT');
          setTotalTaskTime(900);
          setAppState('TIMEOUT_INFO');
        }
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [appState, taskStartTime, currentTrialNumber, selectedGroup, inertiaStep, inertiaInc, inertiaSmoothing, mirrorSize, mirrorThickness, mirrorDuration]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw points
    const drawPoints = (pts: RawPoint[]) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = BRUSH_COLOR;
      ctx.lineWidth = BRUSH_WIDTH;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    };

    drawPoints(currentStrokePointsRef.current);

    // Draw brush tip
    if (lastVirtualPosRef.current && (isDrawingRef.current || selectedGroup !== 'CONTROL')) {
      const now = Date.now();
      const isInverted = now < inversionEndTimeRef.current;
      ctx.beginPath();
      ctx.arc(lastVirtualPosRef.current.x, lastVirtualPosRef.current.y, BRUSH_WIDTH + 1, 0, Math.PI * 2);
      ctx.fillStyle = isInverted ? '#0000ff' : BRUSH_COLOR;
      ctx.fill();
    }
  }, [selectedGroup]);

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        redraw();
      }
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, [redraw, appState]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked || (appState !== 'TASK' && appState !== 'TRAINING')) return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = (e as React.TouchEvent).touches[0].clientX;
      clientY = (e as React.TouchEvent).touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const startX = Math.round(clientX - rect.left);
    const startY = Math.round(clientY - rect.top);

    isDrawingRef.current = true;
    lastActualPosRef.current = { x: startX, y: startY };
    lastVirtualPosRef.current = { x: startX, y: startY };
    
    cumulativeDistanceRef.current = 0;
    currentSensitivityRef.current = 1.0;
    inversionEndTimeRef.current = 0;
    lastDeltaRef.current = { dx: 0, dy: 0 };

    currentStrokePointsRef.current = [{ x: startX, y: startY, t: Date.now() }];
    redraw();
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (appState !== 'TASK' && appState !== 'TRAINING') return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = (e as React.TouchEvent).touches[0].clientX;
      clientY = (e as React.TouchEvent).touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const currentActualX = clientX - rect.left;
    const currentActualY = clientY - rect.top;

    if (!isDrawingRef.current) {
      lastVirtualPosRef.current = { x: currentActualX, y: currentActualY };
      redraw();
      return;
    }

    if (isLocked) return;

    let dx = currentActualX - lastActualPosRef.current!.x;
    let dy = currentActualY - lastActualPosRef.current!.y;
    const now = Date.now();

    if (selectedGroup === 'INERTIA') {
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance === 0) {
        currentSensitivityRef.current = 1.0;
        cumulativeDistanceRef.current = 0;
        lastDeltaRef.current = { dx: 0, dy: 0 };
      } else {
        cumulativeDistanceRef.current += distance;
        currentSensitivityRef.current = 1.0 + (Math.floor(cumulativeDistanceRef.current / inertiaStep) * inertiaInc);
      }
      
      let targetDx = dx * currentSensitivityRef.current;
      let targetDy = dy * currentSensitivityRef.current;

      dx = targetDx * (1 - inertiaSmoothing) + lastDeltaRef.current.dx * inertiaSmoothing;
      dy = targetDy * (1 - inertiaSmoothing) + lastDeltaRef.current.dy * inertiaSmoothing;
      
      lastDeltaRef.current = { dx, dy };
    }

    let isInverted = now < inversionEndTimeRef.current;
    if (selectedGroup === 'MIRROR') {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      const vx = lastVirtualPosRef.current!.x;
      const vy = lastVirtualPosRef.current!.y;

      const halfSize = mirrorSize / 2;
      const innerHalfSize = halfSize - mirrorThickness;

      const dxFromCenter = Math.abs(vx - centerX);
      const dyFromCenter = Math.abs(vy - centerY);

      const isTouchingFrame = (dxFromCenter <= halfSize && dyFromCenter <= halfSize) && 
                              !(dxFromCenter <= innerHalfSize && dyFromCenter <= innerHalfSize);

      if (isTouchingFrame && now >= inversionEndTimeRef.current) {
        inversionEndTimeRef.current = now + mirrorDuration;
        isInverted = true;
      }

      if (isInverted) {
        dx *= -1;
        dy *= -1;
      }
    }

    const virtualX = lastVirtualPosRef.current!.x + dx;
    const virtualY = lastVirtualPosRef.current!.y + dy;
    
    const newPoint = { x: Math.round(virtualX), y: Math.round(virtualY), t: now, isInverted };
    currentStrokePointsRef.current.push(newPoint);
    lastVirtualPosRef.current = { x: virtualX, y: virtualY };
    lastActualPosRef.current = { x: currentActualX, y: currentActualY };
    redraw();
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    
    const points = [...currentStrokePointsRef.current];
    if (points.length > 0) {
      if (appState === 'TASK') {
        setIsLocked(true); 
      } else if (appState === 'TRAINING') {
        if (trainingStep < 3) {
          setTrainingStep(prev => prev + 1);
          currentStrokePointsRef.current = [];
          redraw();
        } else {
          setAppState('INSTRUCTION');
          currentStrokePointsRef.current = [];
          redraw();
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === 'f') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen();
        }
        return;
      }

      if (key === 'y') {
        setShowSettings(prev => !prev);
        return;
      }

      if (appState === 'SURVEY' && surveyStep === 0) {
        if (key === ' ') {
          setSurveyStep(1);
        }
        return;
      }

      if (appState === 'FINISHED') {
        if (key === 'e') {
          setAppState('EXPORT');
        }
        return;
      }

      if (appState === 'TRAINING') {
        if (key === 'r') {
          currentStrokePointsRef.current = [];
          redraw();
        }
        return;
      }

      if (appState !== 'TASK') return;
      
      if (key === 'r') {
        setCurrentTrialNumber(prev => prev + 1);
        setIsLocked(false);
        currentStrokePointsRef.current = [];
        cumulativeDistanceRef.current = 0;
        currentSensitivityRef.current = 1.0;
        inversionEndTimeRef.current = 0;
        redraw();
      } else if (key === 't') {
        setAppState('SURVEY');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, redraw, surveyStep]);

  const generateCSVData = () => {
    const delimiter = ';';
    const header = [
      "isElement", "trialNumber", "lineLength", "x", "y", "time1", "time2", "group", 
      "isInverted", "inertiaStep", "inertiaInc", "inertiaSmoothing", "mirrorSize", "mirrorThickness", "mirrorDuration",
      "solvedBefore", "insight", "Удовольствие", "Удивление", "Внезапность", "Облегчение", "Уверенность", "Драйв", "gender", "age",
      "trialDuration", "totalTaskTime"
    ].join(delimiter);
    const rows: string[] = [header];

    const metaRows = [
      ["0", "900", "seconds", "10,1", "-1", "1920", "1081", "96"],
      ["1", "631", "278", "40", "45", "0", "0"],
      ["1", "747", "278", "40", "45", "0", "0"],
      ["1", "863", "278", "40", "45", "0", "0"],
      ["1", "631", "394", "40", "45", "0", "0"],
      ["1", "747", "394", "40", "45", "0", "0"],
      ["1", "863", "394", "40", "45", "0", "0"],
      ["1", "631", "510", "40", "45", "0", "0"],
      ["1", "747", "510", "40", "45", "0", "0"],
      ["1", "863", "510", "40", "45", "0", "0"],
      ["1", "515", "510", "0", "0", "0", "0"]
    ];

    metaRows.forEach(meta => {
      const padded = [...meta];
      while (padded.length < 27) padded.push("");
      rows.push(padded.join(delimiter));
    });

    allTrials.forEach((trial) => {
      const startTime = trial.points[0]?.t || 0;
      if (trial.points.length === 0) {
        const row = [
          0,
          trial.trialNumber,
          -1,
          "", "", "", "",
          trial.group,
          "",
          trial.inertiaStep ?? "",
          trial.inertiaInc ?? "",
          trial.inertiaSmoothing ?? "",
          trial.mirrorSize ?? "",
          trial.mirrorThickness ?? "",
          trial.mirrorDuration ?? "",
          surveyData.solvedBefore ?? "",
          surveyData.insight ?? "",
          surveyData.Удовольствие ?? "",
          surveyData.Удивление ?? "",
          surveyData.Внезапность ?? "",
          surveyData.Облегчение ?? "",
          surveyData.Уверенность ?? "",
          surveyData.Драйв ?? "",
          surveyData.gender ?? "",
          surveyData.age ?? "",
          (trial.trialDuration / 1000).toFixed(3).replace('.', ','),
          totalTaskTime.toString().replace('.', ',')
        ].join(delimiter);
        rows.push(row);
      } else {
        trial.points.forEach((pt, index) => {
          const time1 = pt.t - startTime;
          const time2 = Math.floor(time1 / 16) * 16;
          const row = [
            0,
            trial.trialNumber,
            index,
            pt.x,
            pt.y,
            time1,
            time2,
            trial.group,
            pt.isInverted ? 1 : 0,
            trial.inertiaStep ?? "",
            trial.inertiaInc ?? "",
            trial.inertiaSmoothing ?? "",
            trial.mirrorSize ?? "",
            trial.mirrorThickness ?? "",
            trial.mirrorDuration ?? "",
            surveyData.solvedBefore ?? "",
            surveyData.insight ?? "",
            surveyData.Удовольствие ?? "",
            surveyData.Удивление ?? "",
            surveyData.Внезапность ?? "",
            surveyData.Облегчение ?? "",
            surveyData.Уверенность ?? "",
            surveyData.Драйв ?? "",
            surveyData.gender ?? "",
            surveyData.age ?? "",
            (trial.trialDuration / 1000).toFixed(3).replace('.', ','),
            totalTaskTime.toString().replace('.', ',')
          ].join(delimiter);
          rows.push(row);
        });
      }
    });

    return rows.join('\n');
  };

  const downloadCSV = () => {
    const csvContent = generateCSVData();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nine_dots_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadFinalImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const startX = centerX - NINE_DOTS_SIZE / 2;
    const startY = centerY - NINE_DOTS_SIZE / 2;

    ctx.fillStyle = '#000000';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        ctx.beginPath();
        ctx.arc(startX + NINE_DOTS_PADDING + col * NINE_DOTS_SPACING, startY + NINE_DOTS_PADDING + row * NINE_DOTS_SPACING, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const lastTrial = allTrials[allTrials.length - 1];
    if (lastTrial && lastTrial.points.length > 1) {
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = BRUSH_COLOR;
      ctx.lineWidth = BRUSH_WIDTH;
      ctx.moveTo(lastTrial.points[0].x, lastTrial.points[0].y);
      for (let i = 1; i < lastTrial.points.length; i++) {
        ctx.lineTo(lastTrial.points[i].x, lastTrial.points[i].y);
      }
      ctx.stroke();
    }

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nine_dots_solution_${Date.now()}.png`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startTask = (group: Group) => {
    setSelectedGroup(group);
    setTrainingStep(1);
    setIsLocked(false);
    currentStrokePointsRef.current = [];
    cumulativeDistanceRef.current = 0;
    currentSensitivityRef.current = 1.0;
    inversionEndTimeRef.current = 0;
    setAppState('TRAINING');
  };

  return (
    <div className={`relative w-screen h-screen bg-white overflow-hidden select-none touch-none ${selectedGroup !== 'CONTROL' ? 'cursor-none' : ''}`}>
      <AnimatePresence mode="wait">
        {appState === 'SELECT' && (
          <motion.div 
            key="select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8"
          >
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="text-center mb-16">
              <h1 className="text-5xl font-black mb-4 text-gray-900 tracking-tight">Experiment Pilot</h1>
              <p className="text-xl text-gray-500 font-medium">Cognitive Load & Problem Solving Dynamics</p>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-10">
              {(['CONTROL', 'INERTIA', 'MIRROR'] as Group[]).map((group, idx) => (
                <motion.button 
                  key={group}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  onClick={() => startTask(group)} 
                  className="group relative flex flex-col items-center p-12 bg-white border-2 border-gray-100 hover:border-blue-500 rounded-[2.5rem] transition-all w-72 shadow-xl hover:shadow-2xl hover:-translate-y-2"
                >
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 transition-colors ${
                    group === 'CONTROL' ? 'bg-blue-50 text-blue-600' : 
                    group === 'INERTIA' ? 'bg-red-50 text-red-600' : 
                    'bg-purple-50 text-purple-600'
                  }`}>
                    {group === 'CONTROL' && <Settings size={40} />}
                    {group === 'INERTIA' && <Play size={40} />}
                    {group === 'MIRROR' && <RotateCcw size={40} />}
                  </div>
                  <span className="text-2xl font-bold text-gray-800 tracking-tight uppercase">{group}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {appState === 'INSTRUCTION' && (
          <motion.div 
            key="instruction"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex flex-col items-center justify-center min-h-screen bg-white p-12 text-center max-w-4xl mx-auto"
          >
            <div className="bg-blue-50 p-4 rounded-full mb-8 text-blue-600">
              <Info size={48} />
            </div>
            <p className="text-3xl text-gray-900 leading-snug mb-12 font-semibold">
              Отлично! Теперь мы можем перейти к основной задаче. Вам будет
              необходимо соединить 9 точек 4 прямыми линиями, не отрывая руки.
              Постарайтесь рисовать каждое свое решение, а не просто мысленно
              решать задачу.
            </p>
            <p className="text-xl text-gray-500 mb-16 max-w-2xl">
              В левом углу экрана будут находиться две кнопки. Если нарисованное решение кажется неправильным, нажмите «Продолжить» (линии сотрутся). Если уверены в ответе — «Сохранить».
            </p>
            <button 
              onClick={() => {
                setIsLocked(false);
                setTaskStartTime(Date.now());
                trialStartTimeRef.current = Date.now();
                setElapsedTime(0);
                setAppState('TASK');
              }}
              className="bg-gray-900 hover:bg-black text-white font-black py-6 px-20 rounded-[2rem] shadow-2xl transition-all transform hover:scale-105 text-2xl flex items-center gap-4"
            >
              Начать эксперимент <ChevronRight size={32} />
            </button>
          </motion.div>
        )}

        {appState === 'SURVEY' && (
          <motion.div 
            key="survey"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen flex items-center justify-center bg-white"
          >
            {/* Survey Screen Logic... simplified for the initial migration, keeping user's logic */}
            {surveyStep === 0 && (
              <div className="text-center p-12 max-w-3xl">
                <p className="text-3xl font-bold text-gray-900 leading-relaxed mb-12">
                  Пожалуйста, ответьте на вопросы о том, как проходил Ваш поиск решения.
                </p>
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 2 }} className="text-blue-600 font-black text-xl uppercase tracking-widest">
                  Нажмите ПРОБЕЛ для продолжения
                </motion.div>
              </div>
            )}
            
            {/* Survey Step 1-10 components would go here, maintaining user code structure */}
            {surveyStep === 1 && (
               <div className="text-center">
               <h2 className="text-4xl font-black mb-16 text-gray-900">Решали ли Вы данную задачу ранее?</h2>
               <div className="flex gap-10">
                 <button onClick={() => { setSurveyData(prev => ({ ...prev, solvedBefore: 'Да' })); setSurveyStep(2); }} className="bg-gray-50 hover:bg-blue-500 hover:text-white border-4 border-gray-100 py-8 px-20 rounded-[2.5rem] text-3xl font-black transition-all">Да</button>
                 <button onClick={() => { setSurveyData(prev => ({ ...prev, solvedBefore: 'Нет' })); setSurveyStep(2); }} className="bg-gray-50 hover:bg-blue-500 hover:text-white border-4 border-gray-100 py-8 px-20 rounded-[2.5rem] text-3xl font-black transition-all">Нет</button>
               </div>
             </div>
            )}

            {surveyStep === 2 && (
              <div className="text-center p-8 max-w-5xl">
                <h2 className="text-2xl font-bold mb-12 text-gray-900 leading-snug">Испытали ли Вы инсайт во время решения данной задачи? Инсайт - это своего рода "Ага-реакция", характеризующаяся внезапностью и очевидностью. Испытали ли Вы инсайт во время решения?</h2>
                <div className="flex gap-8 justify-center">
                  <button onClick={() => { setSurveyData(prev => ({ ...prev, insight: 'Да' })); setSurveyStep(3); }} className="bg-gray-50 hover:bg-blue-600 hover:text-white py-6 px-16 rounded-3xl text-2xl font-black transition-all">Да</button>
                  <button onClick={() => { setSurveyData(prev => ({ ...prev, insight: 'Нет' })); setSurveyStep(3); }} className="bg-gray-50 hover:bg-blue-600 hover:text-white py-6 px-16 rounded-3xl text-2xl font-black transition-all">Нет</button>
                </div>
              </div>
            )}

            {surveyStep >= 3 && surveyStep <= 8 && (
              <div className="w-full max-w-4xl p-12">
                {surveyStep === 3 && <SliderScreen title="В момент обнаружения решения я испытал" left="неприятные чувства" right="приятные чувства" field="Удовольствие" onComplete={(val) => { setSurveyData(prev => ({ ...prev, Удовольствие: val })); setSurveyStep(4); }} />}
                {surveyStep === 4 && <SliderScreen title="Момент, когда я нашел решение, был для меня" left="ожидаемым" right="удивительным" field="Удивление" onComplete={(val) => { setSurveyData(prev => ({ ...prev, Удивление: val })); setSurveyStep(5); }} />}
                {surveyStep === 5 && <SliderScreen title="Это решение пришло ко мне" left="шаг за шагом" right="целиком" field="Внезапность" onComplete={(val) => { setSurveyData(prev => ({ ...prev, Внезапность: val })); setSurveyStep(6); }} />}
                {surveyStep === 6 && <SliderScreen title="Когда я решил задачу, то почувствовал" left="напряжение" right="облегчение" field="Облегчение" onComplete={(val) => { setSurveyData(prev => ({ ...prev, Облегчение: val })); setSurveyStep(7); }} />}
                {surveyStep === 7 && <SliderScreen title="Я был уверен в правильности полученного решения" left="не уверен" right="уверен" field="Уверенность" onComplete={(val) => { setSurveyData(prev => ({ ...prev, Уверенность: val })); setSurveyStep(8); }} />}
                {surveyStep === 8 && <SliderScreen title="Я с нетерпением жду следующего задания" left="не согласен" right="согласен" field="Драйв" onComplete={(val) => { setSurveyData(prev => ({ ...prev, Драйв: val })); setSurveyStep(9); }} />}
              </div>
            )}

            {surveyStep === 9 && (
              <div className="text-center">
                <User size={64} className="mx-auto mb-8 text-gray-300" />
                <h2 className="text-4xl font-black mb-12 text-gray-900">Ваш пол</h2>
                <div className="flex gap-8">
                  <button onClick={() => { setSurveyData(prev => ({ ...prev, gender: 'Мужской' })); setSurveyStep(10); }} className="bg-gray-50 hover:bg-black hover:text-white py-6 px-16 rounded-3xl text-2xl font-black transition-all">Мужской</button>
                  <button onClick={() => { setSurveyData(prev => ({ ...prev, gender: 'Женский' })); setSurveyStep(10); }} className="bg-gray-50 hover:bg-black hover:text-white py-6 px-16 rounded-3xl text-2xl font-black transition-all">Женский</button>
                </div>
              </div>
            )}

            {surveyStep === 10 && (
              <div className="text-center">
                <Calendar size={64} className="mx-auto mb-8 text-gray-300" />
                <h2 className="text-4xl font-black mb-12 text-gray-900 tracking-tight">Ваш возраст</h2>
                <input 
                  type="text" 
                  className="text-7xl text-center border-b-8 border-gray-100 focus:border-blue-500 outline-none mb-16 w-48 font-black transition-colors"
                  autoFocus
                  value={surveyData.age || ''}
                  onChange={(e) => setSurveyData(prev => ({ ...prev, age: e.target.value }))}
                />
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAppState('FINISHED')}
                  className="block mx-auto bg-blue-600 text-white font-black py-6 px-20 rounded-[2rem] shadow-2xl hover:bg-blue-700 transition-all text-2xl"
                >
                  Завершить эксперимент
                </motion.button>
              </div>
            )}
          </motion.div>
        )}

        {appState === 'TIMEOUT_INFO' && (
          <motion.div 
            key="timeout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-screen bg-white p-12 text-center"
          >
            <h1 className="text-5xl font-black text-gray-900 mb-12 tracking-tight">Время истекло</h1>
            <div className="w-full max-w-xl aspect-square bg-gray-50 rounded-[3rem] p-12 shadow-inner border-8 border-gray-100 flex items-center justify-center mb-16">
              <svg width="100%" height="100%" viewBox={`0 0 ${NINE_DOTS_SIZE + NINE_DOTS_SPACING} ${NINE_DOTS_SIZE + NINE_DOTS_SPACING}`}>
                {[0, 1, 2].map(row => [0, 1, 2].map(col => (
                  <circle key={`${row}-${col}`} cx={NINE_DOTS_PADDING + col * NINE_DOTS_SPACING} cy={NINE_DOTS_PADDING + row * NINE_DOTS_SPACING} r={DOT_RADIUS} fill="#000" />
                )))}
                <g fill="none" stroke="#ff0000" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={`M ${NINE_DOTS_PADDING} ${NINE_DOTS_PADDING} L ${NINE_DOTS_PADDING + 3 * NINE_DOTS_SPACING} ${NINE_DOTS_PADDING} L ${NINE_DOTS_PADDING} ${NINE_DOTS_PADDING + 3 * NINE_DOTS_SPACING} L ${NINE_DOTS_PADDING} ${NINE_DOTS_PADDING} L ${NINE_DOTS_PADDING + 2 * NINE_DOTS_SPACING} ${NINE_DOTS_PADDING + 2 * NINE_DOTS_SPACING}`} />
                </g>
              </svg>
            </div>
            <button 
              onClick={() => setAppState('SURVEY')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black py-6 px-16 rounded-[2rem] shadow-2xl transition-all hov"
            >
              Перейти к вопросам
            </button>
          </motion.div>
        )}

        {appState === 'FINISHED' && (
          <motion.div 
            key="finished"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-screen bg-white p-8 text-center"
          >
            <div className="bg-emerald-50 text-emerald-600 p-8 rounded-full mb-12">
              <CheckCircle2 size={80} />
            </div>
            <h1 className="text-6xl font-black text-gray-900 mb-8 tracking-tighter">
              Спасибо за участие!
            </h1>
            <p className="text-2xl text-gray-400 font-medium mb-16">Ваши данные сохранены для дальнейшего анализа.</p>
            <div className="flex gap-6">
              <button 
                onClick={() => setAppState('EXPORT')}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-black py-6 px-12 rounded-[2rem] flex items-center gap-3 text-xl transition-all"
              >
                <Download size={28} /> Экспорт результатов
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white font-black py-6 px-12 rounded-[2rem] shadow-xl hover:bg-blue-700 transition-all text-xl"
              >
                Вернуться в начало
              </button>
            </div>
          </motion.div>
        )}

        {appState === 'EXPORT' && (
          <motion.div 
            key="export"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-screen bg-gray-900 font-mono text-white p-12"
          >
            <div className="flex items-center justify-between w-full max-w-6xl mb-8">
              <h1 className="text-3xl font-black tracking-tighter uppercase">Data Export Control</h1>
              <button onClick={() => setAppState('FINISHED')} className="text-gray-500 hover:text-white transition-colors"><LogOut size={32} /></button>
            </div>
            <div className="w-full max-w-6xl bg-black border border-gray-800 p-8 rounded-[2rem] overflow-auto max-h-[65vh] text-sm text-gray-400 leading-relaxed scrollbar-hide">
              {generateCSVData() || "// NO DATA BUFFERED"}
            </div>
            <div className="flex gap-8 mt-12 w-full max-w-6xl">
              <button onClick={downloadCSV} className="flex-1 bg-white text-black font-black py-6 rounded-[2rem] text-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-3"><Download size={28} /> Download CSV</button>
              <button onClick={downloadFinalImage} className="flex-1 bg-emerald-600 text-white font-black py-6 rounded-[2rem] text-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3"><Save size={28} /> Save Solution Image</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Canvas Area */}
      {(appState === 'TASK' || appState === 'TRAINING') && (
        <>
          <div className={`absolute inset-0 flex justify-center pointer-events-none z-0 ${appState === 'TRAINING' ? 'items-center pt-32' : 'items-center'}`}>
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none opacity-10">
                {/* SVG Grid... keeping existing logic */}
                <svg width="100%" height="100%">
                  <defs>
                    <pattern id="grid" width={NINE_DOTS_SPACING / 2} height={NINE_DOTS_SPACING / 2} patternUnits="userSpaceOnUse" x="50%" y={appState === 'TRAINING' ? 'calc(50% + 64px)' : '50%'}>
                      <path d={`M ${NINE_DOTS_SPACING / 2} 0 L 0 0 0 ${NINE_DOTS_SPACING / 2}`} fill="none" stroke="gray" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>
            )}
            <svg width={NINE_DOTS_SIZE} height={NINE_DOTS_SIZE} viewBox={`0 0 ${NINE_DOTS_SIZE} ${NINE_DOTS_SIZE}`} className="filter grayscale opacity-80">
              {appState === 'TASK' ? (
                [0, 1, 2].map(row => [0, 1, 2].map(col => (
                  <circle key={`${row}-${col}`} cx={NINE_DOTS_PADDING + col * NINE_DOTS_SPACING} cy={NINE_DOTS_PADDING + row * NINE_DOTS_SPACING} r={DOT_RADIUS} fill="#000" />
                )))
              ) : (
                <>
                  {trainingStep === 1 && (<><circle cx={NINE_DOTS_PADDING} cy={NINE_DOTS_PADDING} r={DOT_RADIUS} fill="#000" /><circle cx={NINE_DOTS_PADDING + 2 * NINE_DOTS_SPACING} cy={NINE_DOTS_PADDING + 2 * NINE_DOTS_SPACING} r={DOT_RADIUS} fill="#000" /></>)}
                  {trainingStep === 2 && (<><circle cx={NINE_DOTS_PADDING} cy={NINE_DOTS_PADDING + NINE_DOTS_SPACING} r={DOT_RADIUS} fill="#000" /><circle cx={NINE_DOTS_PADDING + 2 * NINE_DOTS_SPACING} cy={NINE_DOTS_PADDING + NINE_DOTS_SPACING} r={DOT_RADIUS} fill="#000" /></>)}
                  {trainingStep === 3 && (<><circle cx={NINE_DOTS_PADDING + NINE_DOTS_SPACING} cy={NINE_DOTS_PADDING} r={DOT_RADIUS} fill="#000" /><circle cx={NINE_DOTS_PADDING + NINE_DOTS_SPACING} cy={NINE_DOTS_PADDING + 2 * NINE_DOTS_SPACING} r={DOT_RADIUS} fill="#000" /></>)}
                </>
              )}
            </svg>
          </div>

          <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} className="absolute inset-0 z-10 block cursor-crosshair" />

          {selectedGroup === 'MIRROR' && (
            <div 
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 border-dashed border-2 ${mirrorVisible ? 'border-purple-300 opacity-100' : 'border-transparent opacity-0'} transition-opacity duration-500`}
              style={{ width: mirrorSize, height: mirrorSize, borderWidth: mirrorThickness }}
            />
          )}

          {/* HUD & Toolbar */}
          <div className="absolute top-12 left-12 flex flex-col gap-6 z-30 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-xl pointer-events-auto">
               <div className="flex items-center gap-4 mb-4">
                 <div className={`p-2 rounded-xl scale-75 ${selectedGroup === 'CONTROL' ? 'bg-blue-50 text-blue-600' : selectedGroup === 'INERTIA' ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-purple-600'}`}>
                    {selectedGroup === 'CONTROL' ? <Settings /> : selectedGroup === 'INERTIA' ? <Play /> : <RotateCcw />}
                 </div>
                 <span className="font-black text-gray-900 tracking-tighter uppercase">{selectedGroup}</span>
               </div>
               <div className="flex justify-between items-end gap-12">
                 <div>
                   <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Attempt</div>
                   <div className="text-3xl font-black text-gray-900">{currentTrialNumber}</div>
                 </div>
                 <div className="text-right">
                   <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Time Elapsed</div>
                   <div className="text-3xl font-black font-mono text-red-600">{Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</div>
                 </div>
               </div>
            </div>
            
            <button onClick={() => setShowSettings(!showSettings)} className="w-16 h-16 bg-white/90 backdrop-blur-xl rounded-[1.5rem] flex items-center justify-center text-gray-900 shadow-xl border border-gray-100 pointer-events-auto hover:bg-gray-50 transition-colors">
              <Settings className={showSettings ? 'rotate-90' : ''} style={{ transition: 'transform 0.5s' }} />
            </button>
          </div>

          {/* Task Action Buttons */}
          <AnimatePresence>
            {isLocked && appState === 'TASK' && (
              <motion.div 
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                className="absolute top-12 right-12 flex flex-col gap-4 z-40"
              >
                <button 
                  onClick={() => {
                    const duration = Date.now() - trialStartTimeRef.current;
                    setAllTrials(prev => [...prev, { 
                      trialNumber: currentTrialNumber, 
                      group: selectedGroup, 
                      points: [...currentStrokePointsRef.current],
                      trialDuration: duration,
                      inertiaStep: selectedGroup === 'INERTIA' ? inertiaStep : undefined,
                      inertiaInc: selectedGroup === 'INERTIA' ? inertiaInc : undefined,
                      inertiaSmoothing: selectedGroup === 'INERTIA' ? inertiaSmoothing : undefined,
                      mirrorSize: selectedGroup === 'MIRROR' ? mirrorSize : undefined,
                      mirrorThickness: selectedGroup === 'MIRROR' ? mirrorThickness : undefined,
                      mirrorDuration: selectedGroup === 'MIRROR' ? mirrorDuration : undefined
                    }]);
                    setCurrentTrialNumber(prev => prev + 1);
                    setIsLocked(false);
                    trialStartTimeRef.current = Date.now();
                    currentStrokePointsRef.current = [];
                    redraw();
                  }}
                  className="bg-white hover:bg-gray-50 text-gray-900 font-black py-5 px-10 rounded-[1.5rem] shadow-2xl border border-gray-100 flex items-center gap-3 text-xl transition-all active:scale-95"
                >
                  <RotateCcw /> Продолжить
                </button>
                <button 
                  onClick={() => {
                    const duration = Date.now() - trialStartTimeRef.current;
                    setAllTrials(prev => [...prev, { 
                      trialNumber: currentTrialNumber, 
                      group: selectedGroup, 
                      points: [...currentStrokePointsRef.current],
                      trialDuration: duration,
                      inertiaStep: selectedGroup === 'INERTIA' ? inertiaStep : undefined
                    }]);
                    setTotalTaskTime((Date.now() - (taskStartTime || 0)) / 1000);
                    setAppState('SURVEY');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-10 rounded-[1.5rem] shadow-2xl flex items-center gap-3 text-xl transition-all active:scale-95"
                >
                  <Save /> Сохранить
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Side Panels (Settings) */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                className="absolute left-12 bottom-12 w-96 bg-white p-8 rounded-[2.5rem] shadow-3xl border border-gray-100 z-50 pointer-events-auto"
              >
                 <div className="flex items-center justify-between mb-8">
                   <h3 className="font-black text-gray-900 uppercase tracking-tighter">Parameters</h3>
                   <button onClick={() => setShowSettings(false)} className="text-gray-300 hover:text-gray-900"><LogOut size={20} /></button>
                 </div>

                 {selectedGroup === 'INERTIA' && (
                   <div className="space-y-6">
                      <ConfigSlider label="Step" value={inertiaStep} unit="px" min={5} max={500} onChange={setInertiaStep} description="Distance until friction occurs" />
                      <ConfigSlider label="Increment" value={inertiaInc * 100} unit="%" min={1} max={200} onChange={(v) => setInertiaInc(v/100)} description="Sensitivity gain per step" />
                   </div>
                 )}

                 {selectedGroup === 'MIRROR' && (
                   <div className="space-y-6">
                      <ConfigSlider label="Frame Size" value={mirrorSize} unit="px" min={200} max={800} onChange={setMirrorSize} />
                      <ConfigSlider label="Duration" value={mirrorDuration} unit="ms" min={100} max={2000} onChange={setMirrorDuration} />
                   </div>
                 )}

                 {selectedGroup === 'CONTROL' && <p className="text-gray-400 italic font-medium">Standard baseline conditions. No parameters active.</p>}

                 <div className="mt-12 pt-8 border-t border-gray-100">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Alignment Grid</span>
                      <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="w-6 h-6 rounded-lg accent-gray-900" />
                    </label>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

const SliderScreen = ({ title, left, right, field, onComplete }: { title: string, left: string, right: string, field: keyof SurveyData, onComplete: (val: number) => void }) => {
  const [val, setVal] = useState(50);
  const [interacted, setInteracted] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
      <h2 className="text-4xl font-black mb-20 text-gray-900 leading-tight tracking-tight">{title}</h2>
      <div className="w-full mb-16 relative px-12">
        <input 
          type="range" min="0" max="100" step="1" value={val} 
          onChange={(e) => { setVal(parseInt(e.target.value)); setInteracted(true); }}
          className="w-full h-4 bg-gray-100 rounded-full appearance-none accent-black cursor-pointer"
        />
        <div className="flex justify-between mt-8 text-xl font-bold text-gray-400">
          <span className={val < 40 ? 'text-blue-600' : ''}>{left}</span>
          <span className={val > 60 ? 'text-blue-600' : ''}>{right}</span>
        </div>
      </div>
      <button 
        disabled={!interacted}
        onClick={() => onComplete(val)}
        className={`font-black py-6 px-16 rounded-[2rem] shadow-xl transition-all text-2xl uppercase tracking-tighter ${
          interacted ? 'bg-black text-white hover:scale-105 active:scale-95' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
        }`}
      >
        Сохранить ответ
      </button>
    </motion.div>
  );
};

const ConfigSlider = ({ label, value, unit, min, max, onChange, description }: any) => (
  <div>
    <div className="flex justify-between mb-2">
      <span className="text-xs font-black uppercase text-gray-400 tracking-widest">{label}</span>
      <span className="text-xs font-black text-blue-600">{Math.round(value)}{unit}</span>
    </div>
    <input type="range" min={min} max={max} step="1" value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none accent-gray-900 cursor-pointer" />
    {description && <p className="text-[10px] text-gray-400 mt-2 font-medium">{description}</p>}
  </div>
);

export default App;
