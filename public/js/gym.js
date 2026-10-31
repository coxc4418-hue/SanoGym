// Sano Gym — Conocimiento del gimnasio: planes, ejercicios, rutinas, salud y fórmulas de evaluación física

// ======================================================================
// PLANES DE MEMBRESÍA (precios de ejemplo en USD: se adaptan a la moneda del país la primera vez)
// kind: 'tiempo' (por días/meses) · 'sesiones' (paquete de visitas con vigencia) · 'pase' (entrada del día)
// ======================================================================
export const PLAN_KINDS = {
  tiempo: { label: 'Por tiempo', hint: 'Acceso libre durante el período (semana, mes, año…)' },
  sesiones: { label: 'Por sesiones', hint: 'Un número de visitas o clases con fecha límite para usarlas' },
  pase: { label: 'Pase diario', hint: 'Una entrada para hoy' }
};
export const DEFAULT_PLANS = [
  { id: 'pase', name: 'Pase diario', kind: 'pase', days: 1, visits: 1, price: 4, color: '#64748b', classes: true },
  { id: 'semanal', name: 'Semanal', kind: 'tiempo', days: 7, price: 10, color: '#0ea5e9', classes: true },
  { id: 'quincenal', name: 'Quincenal', kind: 'tiempo', days: 15, price: 16, color: '#06b6d4', classes: true },
  { id: 'mensual', name: 'Mensual', kind: 'tiempo', months: 1, price: 28, color: '#65a30d', classes: true, freezeDays: 7, popular: true },
  { id: 'trimestral', name: 'Trimestral', kind: 'tiempo', months: 3, price: 75, color: '#16a34a', classes: true, freezeDays: 15 },
  { id: 'semestral', name: 'Semestral', kind: 'tiempo', months: 6, price: 140, color: '#0d9488', classes: true, freezeDays: 30 },
  { id: 'anual', name: 'Anual', kind: 'tiempo', months: 12, price: 260, color: '#7c3aed', classes: true, freezeDays: 45 },
  { id: 'estudiante', name: 'Estudiante (mensual)', kind: 'tiempo', months: 1, price: 22, color: '#2563eb', classes: true, note: 'Presentar carnet estudiantil vigente' },
  { id: 'manana', name: 'Mañanero (5 a. m. – 12 m.)', kind: 'tiempo', months: 1, price: 22, color: '#f59e0b', timeFrom: '05:00', timeTo: '12:00', classes: false },
  { id: 'clases12', name: '12 clases grupales', kind: 'sesiones', visits: 12, days: 45, price: 30, color: '#db2777', classes: true },
  { id: 'personal8', name: 'Entrenador personal · 8 sesiones', kind: 'sesiones', visits: 8, days: 30, price: 80, color: '#dc2626', personal: true, classes: false }
];

/** Fecha de fin de un plan que empieza en start (YYYY-MM-DD), inclusiva. */
export function planEnd(plan, start) {
  const [y, m, d] = start.split('-').map(Number);
  let e;
  if (plan.kind === 'pase') e = new Date(y, m - 1, d);
  else if (Number(plan.months) > 0) {
    // Mismo día del mes siguiente menos uno; si ese día no existe (31 → febrero), vence el último día del mes
    const last = new Date(y, m - 1 + Number(plan.months) + 1, 0).getDate();
    e = d > last ? new Date(y, m - 1 + Number(plan.months), last) : new Date(y, m - 1 + Number(plan.months), d - 1);
  }
  else { e = new Date(y, m - 1, d + Math.max(1, Number(plan.days) || 30) - 1); }
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
}
export function planDuration(p) {
  if (p.kind === 'pase') return '1 día';
  const t = Number(p.months) > 0 ? `${p.months} ${p.months == 1 ? 'mes' : 'meses'}` : `${p.days || 30} días`;
  return p.kind === 'sesiones' ? `${p.visits || 0} sesiones · vigencia ${t}` : t;
}
/** Precio por día aproximado del plan (para comparar planes) */
export function pricePerDay(p) {
  const days = p.kind === 'pase' ? 1 : Number(p.months) > 0 ? p.months * 30.4 : Number(p.days) || 30;
  return (Number(p.price) || 0) / days;
}

// ======================================================================
// SALUD: PAR-Q (cuestionario de aptitud para la actividad física) y condiciones
// ======================================================================
export const PARQ = [
  '¿Algún médico le ha dicho que tiene una afección cardíaca o la presión arterial alta?',
  '¿Siente dolor en el pecho en reposo, en sus actividades diarias o al hacer ejercicio?',
  '¿Ha perdido el equilibrio por mareos o ha perdido el conocimiento en los últimos 12 meses?',
  '¿Le han diagnosticado otra enfermedad crónica (diabetes, asma, epilepsia, cáncer…)?',
  '¿Toma actualmente medicamentos recetados para una enfermedad crónica?',
  '¿Tiene algún problema en huesos, articulaciones o músculos que pueda empeorar con el ejercicio?',
  '¿Algún médico le ha dicho que solo debe hacer actividad física con supervisión médica?'
];
/** El socio necesita constancia médica si respondió "sí" a alguna pregunta y no la ha presentado */
export const parqRisk = (h = {}) => (h.parq || []).some(Boolean);
export const needsClearance = (h = {}) => parqRisk(h) && !h.clearance;

export const CONDITIONS = ['Hipertensión', 'Diabetes', 'Asma', 'Cardiopatía', 'Embarazo', 'Obesidad', 'Lesión de rodilla', 'Lesión lumbar / hernia discal', 'Lesión de hombro', 'Escoliosis', 'Artrosis', 'Epilepsia', 'Postoperatorio reciente', 'Hipotiroidismo', 'Osteoporosis', 'Marcapasos'];
export const GOALS = ['Bajar de peso', 'Tonificar', 'Ganar masa muscular', 'Fuerza', 'Resistencia y cardio', 'Salud general', 'Rehabilitación', 'Preparación deportiva', 'Flexibilidad y movilidad'];
export const LEVELS = ['Principiante', 'Intermedio', 'Avanzado'];
export const ACTIVITY = [
  [1.2, 'Sedentario (oficina, sin ejercicio)'],
  [1.375, 'Ligero (1–3 entrenamientos por semana)'],
  [1.55, 'Moderado (3–5 entrenamientos por semana)'],
  [1.725, 'Intenso (6–7 entrenamientos por semana)'],
  [1.9, 'Muy intenso (doble turno o trabajo físico)']
];

// ======================================================================
// EVALUACIÓN FÍSICA: fórmulas
// ======================================================================
export function ageOf(birthDate, at = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate + 'T12:00');
  if (isNaN(b)) return null;
  let a = at.getFullYear() - b.getFullYear();
  const md = (at.getMonth() - b.getMonth()) || (at.getDate() - b.getDate());
  if (md < 0) a--;
  return a >= 0 && a < 120 ? a : null;
}
const r1 = (v) => Math.round(v * 10) / 10;

export function bmiOf(weight, height) {
  const w = Number(weight), h = Number(height) / 100;
  return w > 0 && h > 0.5 ? r1(w / (h * h)) : null;
}
export function bmiClass(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { label: 'Bajo peso', tone: 'info' };
  if (bmi < 25) return { label: 'Peso normal', tone: 'success' };
  if (bmi < 30) return { label: 'Sobrepeso', tone: 'warning' };
  if (bmi < 35) return { label: 'Obesidad grado I', tone: 'danger' };
  if (bmi < 40) return { label: 'Obesidad grado II', tone: 'danger' };
  return { label: 'Obesidad grado III', tone: 'danger' };
}
/** % de grasa corporal por el método de la Marina de EE. UU. (medidas en cm) */
export function navyFat({ sex, height, neck, waist, hip }) {
  const h = Number(height), n = Number(neck), w = Number(waist), hp = Number(hip);
  if (!(h > 0 && n > 0 && w > 0)) return null;
  let f;
  if (sex === 'F') { if (!(hp > 0) || w + hp - n <= 0) return null; f = 495 / (1.29579 - 0.35004 * Math.log10(w + hp - n) + 0.221 * Math.log10(h)) - 450; }
  else { if (w - n <= 0) return null; f = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450; }
  return f > 2 && f < 70 ? r1(f) : null;
}
export function fatClass(fat, sex) {
  if (fat == null) return null;
  const T = sex === 'F' ? [14, 21, 25, 32] : [6, 14, 18, 25];
  if (fat < T[0]) return { label: 'Grasa esencial (muy baja)', tone: 'info' };
  if (fat < T[1]) return { label: 'Atlético', tone: 'success' };
  if (fat < T[2]) return { label: 'En forma', tone: 'success' };
  if (fat < T[3]) return { label: 'Promedio', tone: 'warning' };
  return { label: 'Elevado', tone: 'danger' };
}
/** Riesgo cardiometabólico por cintura e índice cintura/cadera (OMS) */
export function waistRisk({ sex, waist, hip }) {
  const w = Number(waist), hp = Number(hip);
  if (!(w > 0)) return null;
  const hi = sex === 'F' ? 88 : 102, mid = sex === 'F' ? 80 : 94;
  const whr = hp > 0 ? Math.round((w / hp) * 100) / 100 : null;
  const whrHigh = whr != null && whr > (sex === 'F' ? 0.85 : 0.9);
  if (w >= hi || whrHigh) return { label: 'Riesgo alto', tone: 'danger', whr };
  if (w >= mid) return { label: 'Riesgo aumentado', tone: 'warning', whr };
  return { label: 'Riesgo bajo', tone: 'success', whr };
}
/** Metabolismo basal (Mifflin-St Jeor) y gasto diario según actividad */
export function energyOf({ sex, weight, height, age, activity = 1.55, goal = '' }) {
  const w = Number(weight), h = Number(height), a = Number(age);
  if (!(w > 0 && h > 0 && a > 0)) return null;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * a + (sex === 'F' ? -161 : 5));
  const tdee = Math.round(bmr * (Number(activity) || 1.55));
  const lose = /bajar|tonific/i.test(goal), gain = /masa|fuerza/i.test(goal);
  const target = Math.max(bmr, Math.round(tdee * (lose ? 0.8 : gain ? 1.1 : 1)));
  const protein = Math.round(w * (lose ? 2 : gain ? 1.8 : 1.4));
  return { bmr, tdee, target, protein, water: Math.round(w * 35 / 100) / 10, mode: lose ? 'Déficit del 20 %' : gain ? 'Superávit del 10 %' : 'Mantenimiento' };
}
export function idealRange(height) {
  const h = Number(height) / 100;
  return h > 0.5 ? [r1(18.5 * h * h), r1(24.9 * h * h)] : null;
}
/** Todos los cálculos de una evaluación */
export function evalCalc(ev, member = {}) {
  const sex = member.sex || ev.sex;
  const age = ageOf(member.birthDate, ev.date ? new Date(ev.date + 'T12:00') : new Date());
  const bmi = bmiOf(ev.weight, ev.height);
  const navy = navyFat({ sex, height: ev.height, neck: ev.neck, waist: ev.waist, hip: ev.hip });
  const fat = Number(ev.fat) > 0 ? Number(ev.fat) : navy;
  const fatMass = fat != null && ev.weight ? r1(ev.weight * fat / 100) : null;
  const lean = fatMass != null ? r1(ev.weight - fatMass) : null;
  return {
    age, bmi, bmiClass: bmiClass(bmi), navy, fat, fatSource: Number(ev.fat) > 0 ? 'medido' : navy != null ? 'Marina EE. UU.' : '',
    fatClass: fatClass(fat, sex), fatMass, lean, risk: waistRisk({ sex, waist: ev.waist, hip: ev.hip }),
    ideal: idealRange(ev.height), energy: energyOf({ sex, weight: ev.weight, height: ev.height, age, activity: ev.activity || member.activity, goal: member.goal })
  };
}
export const MEASURES = [
  ['weight', 'Peso', 'kg'], ['height', 'Estatura', 'cm'], ['fat', '% grasa (báscula)', '%'], ['muscle', 'Masa muscular', 'kg'], ['visceral', 'Grasa visceral', 'nivel'],
  ['neck', 'Cuello', 'cm'], ['chest', 'Pecho', 'cm'], ['waist', 'Cintura', 'cm'], ['hip', 'Cadera', 'cm'], ['arm', 'Brazo', 'cm'], ['thigh', 'Muslo', 'cm'], ['calf', 'Pantorrilla', 'cm'],
  ['restHr', 'Frecuencia cardíaca en reposo', 'lpm'], ['bp', 'Tensión arterial', 'mmHg']
];

// ======================================================================
// BIBLIOTECA DE EJERCICIOS: [id, nombre, grupo, equipo]
// ======================================================================
export const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Femorales y glúteos', 'Pantorrillas', 'Abdomen y core', 'Cardio', 'Funcional', 'Movilidad'];
const X = (id, name, group, eq) => ({ id, name, group, eq });
export const EXERCISES = [
  X('pb', 'Press de banca con barra', 'Pecho', 'Barra'), X('pbm', 'Press de banca con mancuernas', 'Pecho', 'Mancuernas'), X('pi', 'Press inclinado con barra', 'Pecho', 'Barra'),
  X('pim', 'Press inclinado con mancuernas', 'Pecho', 'Mancuernas'), X('pd', 'Press declinado', 'Pecho', 'Barra'), X('ap', 'Aperturas con mancuernas', 'Pecho', 'Mancuernas'),
  X('cc', 'Cruce de poleas', 'Pecho', 'Polea'), X('pec', 'Pec deck (contractor)', 'Pecho', 'Máquina'), X('fl', 'Flexiones de pecho', 'Pecho', 'Peso corporal'), X('fp', 'Fondos en paralelas', 'Pecho', 'Peso corporal'),
  X('dom', 'Dominadas', 'Espalda', 'Peso corporal'), X('jal', 'Jalón al pecho', 'Espalda', 'Polea'), X('jalc', 'Jalón con agarre cerrado', 'Espalda', 'Polea'), X('rb', 'Remo con barra', 'Espalda', 'Barra'),
  X('rm', 'Remo con mancuerna a una mano', 'Espalda', 'Mancuernas'), X('rs', 'Remo sentado en polea', 'Espalda', 'Polea'), X('rt', 'Remo en T', 'Espalda', 'Barra'), X('pm', 'Peso muerto', 'Espalda', 'Barra'),
  X('pul', 'Pullover en polea', 'Espalda', 'Polea'), X('hip', 'Hiperextensiones lumbares', 'Espalda', 'Banco'),
  X('pmil', 'Press militar con barra', 'Hombros', 'Barra'), X('pmm', 'Press de hombros con mancuernas', 'Hombros', 'Mancuernas'), X('arn', 'Press Arnold', 'Hombros', 'Mancuernas'),
  X('el', 'Elevaciones laterales', 'Hombros', 'Mancuernas'), X('ef', 'Elevaciones frontales', 'Hombros', 'Mancuernas'), X('pajp', 'Pájaros (deltoide posterior)', 'Hombros', 'Mancuernas'),
  X('fp2', 'Face pull en polea', 'Hombros', 'Polea'), X('rmen', 'Remo al mentón', 'Hombros', 'Barra'), X('enc', 'Encogimientos de trapecio', 'Hombros', 'Mancuernas'),
  X('cb', 'Curl con barra', 'Bíceps', 'Barra'), X('cm', 'Curl alterno con mancuernas', 'Bíceps', 'Mancuernas'), X('cmar', 'Curl martillo', 'Bíceps', 'Mancuernas'),
  X('cpr', 'Curl predicador (Scott)', 'Bíceps', 'Máquina'), X('ccon', 'Curl concentrado', 'Bíceps', 'Mancuernas'), X('cpol', 'Curl en polea', 'Bíceps', 'Polea'),
  X('ext', 'Extensión de tríceps en polea', 'Tríceps', 'Polea'), X('pfr', 'Press francés', 'Tríceps', 'Barra'), X('pk', 'Patada de tríceps', 'Tríceps', 'Mancuernas'),
  X('fb', 'Fondos en banco', 'Tríceps', 'Peso corporal'), X('pcer', 'Press de banca agarre cerrado', 'Tríceps', 'Barra'), X('extn', 'Extensión tras nuca', 'Tríceps', 'Mancuernas'),
  X('sq', 'Sentadilla con barra', 'Cuádriceps', 'Barra'), X('sqg', 'Sentadilla goblet', 'Cuádriceps', 'Mancuernas'), X('sqf', 'Sentadilla frontal', 'Cuádriceps', 'Barra'),
  X('pre', 'Prensa de piernas', 'Cuádriceps', 'Máquina'), X('ext2', 'Extensión de cuádriceps', 'Cuádriceps', 'Máquina'), X('zan', 'Zancadas (estocadas)', 'Cuádriceps', 'Mancuernas'),
  X('bul', 'Sentadilla búlgara', 'Cuádriceps', 'Mancuernas'), X('hack', 'Sentadilla hack', 'Cuádriceps', 'Máquina'), X('step', 'Subidas al cajón (step-up)', 'Cuádriceps', 'Cajón'),
  X('pmr', 'Peso muerto rumano', 'Femorales y glúteos', 'Barra'), X('cfem', 'Curl femoral acostado', 'Femorales y glúteos', 'Máquina'), X('cfs', 'Curl femoral sentado', 'Femorales y glúteos', 'Máquina'),
  X('ht', 'Hip thrust', 'Femorales y glúteos', 'Barra'), X('pg', 'Puente de glúteos', 'Femorales y glúteos', 'Peso corporal'), X('pat', 'Patada de glúteo en polea', 'Femorales y glúteos', 'Polea'),
  X('abd', 'Abducción de cadera', 'Femorales y glúteos', 'Máquina'), X('add', 'Aducción de cadera', 'Femorales y glúteos', 'Máquina'), X('kb', 'Swing con pesa rusa', 'Femorales y glúteos', 'Pesa rusa'),
  X('pp', 'Elevación de talones de pie', 'Pantorrillas', 'Máquina'), X('ps', 'Elevación de talones sentado', 'Pantorrillas', 'Máquina'), X('ppr', 'Pantorrilla en prensa', 'Pantorrillas', 'Máquina'),
  X('cr', 'Crunch abdominal', 'Abdomen y core', 'Peso corporal'), X('pl', 'Plancha', 'Abdomen y core', 'Peso corporal'), X('pll', 'Plancha lateral', 'Abdomen y core', 'Peso corporal'),
  X('ep', 'Elevación de piernas colgado', 'Abdomen y core', 'Barra fija'), X('rr', 'Rueda abdominal', 'Abdomen y core', 'Rueda'), X('rus', 'Giro ruso', 'Abdomen y core', 'Disco'),
  X('mc', 'Escaladores (mountain climbers)', 'Abdomen y core', 'Peso corporal'), X('bic', 'Crunch bicicleta', 'Abdomen y core', 'Peso corporal'), X('pal', 'Press Pallof', 'Abdomen y core', 'Polea'),
  X('cin', 'Caminadora', 'Cardio', 'Caminadora'), X('eli', 'Elíptica', 'Cardio', 'Elíptica'), X('bic2', 'Bicicleta estática', 'Cardio', 'Bicicleta'), X('rem', 'Remo ergómetro', 'Cardio', 'Remo'),
  X('esc', 'Escaladora', 'Cardio', 'Escaladora'), X('cue', 'Saltar la cuerda', 'Cardio', 'Cuerda'), X('hiit', 'Intervalos HIIT en caminadora', 'Cardio', 'Caminadora'),
  X('bur', 'Burpees', 'Funcional', 'Peso corporal'), X('wb', 'Wall ball', 'Funcional', 'Balón medicinal'), X('fw', 'Paseo del granjero', 'Funcional', 'Mancuernas'),
  X('bat', 'Cuerdas de batalla', 'Funcional', 'Cuerdas'), X('box', 'Saltos al cajón', 'Funcional', 'Cajón'), X('tgu', 'Levantamiento turco', 'Funcional', 'Pesa rusa'),
  X('trx', 'Remo en TRX', 'Funcional', 'TRX'), X('thr', 'Thrusters', 'Funcional', 'Barra'), X('sled', 'Empuje de trineo', 'Funcional', 'Trineo'),
  X('mov1', 'Movilidad de cadera (90/90)', 'Movilidad', 'Colchoneta'), X('mov2', 'Estiramiento de isquiotibiales', 'Movilidad', 'Colchoneta'), X('mov3', 'Gato-camello', 'Movilidad', 'Colchoneta'),
  X('mov4', 'Rotaciones torácicas', 'Movilidad', 'Colchoneta'), X('mov5', 'Liberación con rodillo (foam roller)', 'Movilidad', 'Rodillo'), X('mov6', 'Movilidad de hombro con banda', 'Movilidad', 'Banda elástica')
];
export const exercise = (id) => EXERCISES.find((e) => e.id === id);

// ======================================================================
// PLANTILLAS DE RUTINA: días → [id ejercicio, series, repeticiones, descanso (s)]
// ======================================================================
const D = (name, items) => ({ name, items: items.map(([ex, sets, reps, rest = 60, note = '']) => ({ exId: ex, name: exercise(ex)?.name || ex, sets, reps: String(reps), rest, weight: '', note })) });
export const ROUTINE_TEMPLATES = [
  { id: 't-inicio', name: 'Inicio · Cuerpo completo 3 días', goal: 'Salud general', level: 'Principiante', weeks: 4, note: 'Técnica primero: peso que permita terminar todas las repeticiones con buena forma. 10 min de cardio suave para calentar.', days: [
    D('Día A', [['cin', 1, '10 min', 0], ['pre', 3, 12], ['pbm', 3, 12], ['jal', 3, 12], ['pmm', 2, 12], ['cfem', 2, 12], ['pl', 3, '30 s', 45], ['mov2', 1, '5 min', 0]]),
    D('Día B', [['bic2', 1, '10 min', 0], ['sqg', 3, 12], ['pec', 3, 12], ['rs', 3, 12], ['el', 2, 15], ['pg', 3, 15], ['cr', 3, 15, 45], ['mov3', 1, '5 min', 0]]),
    D('Día C', [['eli', 1, '10 min', 0], ['zan', 3, '10 c/p'], ['fl', 3, 10], ['rm', 3, '12 c/l'], ['cmar', 2, 12], ['ext', 2, 12], ['pll', 3, '20 s c/l', 45], ['mov5', 1, '5 min', 0]])
  ] },
  { id: 't-grasa', name: 'Quema de grasa · Circuito 4 días', goal: 'Bajar de peso', level: 'Intermedio', weeks: 6, note: 'Circuitos con poco descanso entre ejercicios (30 s) y 2 min entre vueltas. Termina con 20 min de cardio en zona 2.', days: [
    D('Lunes · Tren inferior', [['sqg', 4, 15, 30], ['kb', 4, 20, 30], ['zan', 4, '12 c/p', 30], ['mc', 4, '40 s', 30], ['cin', 1, '20 min', 0, 'Inclinación 8 %']]),
    D('Martes · Tren superior', [['fl', 4, 12, 30], ['trx', 4, 12, 30], ['pmm', 4, 12, 30], ['bat', 4, '30 s', 30], ['eli', 1, '20 min', 0]]),
    D('Jueves · HIIT', [['bur', 5, 10, 30], ['box', 5, 10, 30], ['wb', 5, 15, 30], ['hiit', 1, '15 min', 0, '30 s rápido / 60 s suave']]),
    D('Viernes · Cuerpo completo', [['thr', 4, 12, 45], ['rb', 4, 12, 45], ['bul', 3, '10 c/p', 45], ['fw', 3, '40 m', 45], ['rr', 3, 10, 45], ['rem', 1, '15 min', 0]])
  ] },
  { id: 't-ppl', name: 'Hipertrofia · Empuje / Tirón / Pierna', goal: 'Ganar masa muscular', level: 'Intermedio', weeks: 8, note: 'Progresión: cuando completes todas las series en el rango alto, sube el peso. Descanso 90 s en básicos.', days: [
    D('Empuje (pecho, hombro, tríceps)', [['pb', 4, '8-10', 90], ['pim', 3, '10-12', 75], ['cc', 3, 12], ['pmm', 3, '10-12', 75], ['el', 4, 15, 45], ['ext', 3, 12], ['pfr', 3, 10]]),
    D('Tirón (espalda, bíceps)', [['dom', 4, '6-10', 90], ['rb', 4, '8-10', 90], ['rs', 3, 12], ['jalc', 3, 12], ['fp2', 3, 15, 45], ['cb', 3, 10], ['cmar', 3, 12]]),
    D('Pierna', [['sq', 4, '8-10', 120], ['pmr', 4, 10, 90], ['pre', 3, 12, 90], ['cfem', 3, 12], ['ext2', 3, 15], ['pp', 4, 15, 45], ['ep', 3, 12, 45]])
  ] },
  { id: 't-fuerza', name: 'Fuerza · 5×5', goal: 'Fuerza', level: 'Avanzado', weeks: 8, note: 'Alterna A y B, 3 días por semana. Sube 2,5 kg cuando completes 5×5. Descanso 3 min en los básicos.', days: [
    D('Entreno A', [['sq', 5, 5, 180], ['pb', 5, 5, 180], ['rb', 5, 5, 180], ['pl', 3, '45 s', 60]]),
    D('Entreno B', [['sq', 5, 5, 180], ['pmil', 5, 5, 180], ['pm', 1, 5, 180, 'Una serie pesada'], ['dom', 3, 'máx.', 120]])
  ] },
  { id: 't-gluteo', name: 'Glúteos y piernas · 3 días', goal: 'Tonificar', level: 'Intermedio', weeks: 6, note: 'Controla la bajada (3 s) y aprieta el glúteo arriba. Complementa con 2 días de tren superior.', days: [
    D('Día 1 · Glúteo', [['ht', 4, 10, 90], ['bul', 3, '10 c/p', 75], ['pat', 3, '15 c/p', 45], ['abd', 4, 20, 45], ['pg', 3, 20, 45]]),
    D('Día 2 · Cuádriceps', [['sq', 4, 10, 90], ['pre', 4, 12, 75], ['ext2', 3, 15], ['step', 3, '12 c/p'], ['pp', 4, 20, 45]]),
    D('Día 3 · Femoral', [['pmr', 4, 10, 90], ['cfem', 4, 12], ['kb', 4, 20], ['add', 3, 15, 45], ['mc', 3, '40 s', 30]])
  ] },
  { id: 't-mayor', name: 'Adulto mayor · Movilidad y fuerza', goal: 'Salud general', level: 'Principiante', weeks: 6, note: 'Movimientos lentos y controlados, sin bloquear articulaciones. Tensión arterial antes de empezar si es hipertenso.', days: [
    D('Día A', [['bic2', 1, '10 min', 0, 'Ritmo suave'], ['sqg', 2, 10, 90, 'Sentarse y pararse de una silla'], ['rs', 2, 12, 90], ['pg', 2, 12, 60], ['mov4', 1, '5 min', 0], ['mov1', 1, '5 min', 0]]),
    D('Día B', [['cin', 1, '15 min', 0], ['step', 2, '8 c/p', 90], ['pmm', 2, 10, 90], ['fw', 2, '20 m', 90], ['mov6', 1, '5 min', 0], ['mov2', 1, '5 min', 0]])
  ] }
];

// ======================================================================
// CLASES GRUPALES (horario de ejemplo)
// ======================================================================
export const CLASS_TYPES = ['Spinning', 'Funcional', 'CrossFit', 'HIIT', 'Yoga', 'Pilates', 'Zumba', 'Body pump', 'Boxeo', 'Kickboxing', 'Stretching', 'GAP (glúteo, abdomen, pierna)', 'Aeróbicos', 'Calistenia', 'Bailoterapia', 'TRX'];
export const CLASS_COLORS = ['#65a30d', '#0ea5e9', '#f97316', '#db2777', '#7c3aed', '#14b8a6', '#eab308', '#ef4444', '#2563eb', '#16a34a'];
export const SAMPLE_CLASSES = [
  ['Spinning', [1, 3, 5], '06:30', 45, 20, 'Sala de ciclo', 0], ['Spinning', [1, 3, 5], '18:30', 45, 20, 'Sala de ciclo', 0],
  ['Funcional', [2, 4], '07:00', 50, 16, 'Zona funcional', 1], ['Funcional', [2, 4], '19:00', 50, 16, 'Zona funcional', 1],
  ['Zumba', [1, 3], '19:30', 60, 30, 'Salón principal', 3], ['Yoga', [6], '09:00', 60, 18, 'Salón principal', 4],
  ['Pilates', [2, 5], '08:00', 50, 14, 'Salón principal', 5], ['CrossFit', [1, 2, 3, 4, 5], '17:30', 60, 15, 'Box', 2],
  ['GAP (glúteo, abdomen, pierna)', [2, 4], '18:00', 45, 25, 'Salón principal', 6], ['Boxeo', [6], '10:30', 60, 12, 'Zona funcional', 7]
];
