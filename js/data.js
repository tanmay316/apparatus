/* ===================== DATA & CONFIG ===================== */
function ex(name, sets, tempo, rest, cues, yt){ return {name, sets, tempo, rest, cues, yt: yt || name}; }

const DEFAULT_WARMUP = { title:"Warm-Up", time:"6 min", items:[
  {name:"Band shoulder dislocations", sets:"2 x 12", cues:["Hold a resistance band wide, arms straight.","Raise band overhead and rotate it behind your head to your lower back.","Keep elbows locked and move slow — widen your grip if your shoulders round."]},
  {name:"Band pull-aparts", sets:"2 x 12", cues:["Arms straight out in front, band taut between hands.","Pull the band apart to touch your chest, squeezing shoulder blades together.","Control the return — don't let the band snap your arms forward."]},
  {name:"Scapular push-ups", sets:"2 x 10", cues:["Start in a push-up plank, arms locked straight (no elbow bend).","Let your shoulder blades pinch together, dropping your chest slightly.","Push the floor away, rounding your upper back — this moves only at the shoulder blades."]},
  {name:"Scapular pull-ups", sets:"2 x 10", cues:["Hang from the bar with straight arms.","Without bending the elbows, pull your shoulder blades down and together.","Lower under control back to a dead hang."]},
  {name:"Arm circles + wrist circles", sets:"1 min", cues:["Big slow arm circles both directions to open the shoulders.","Follow with wrist circles and a few wrist flexor/extensor stretches.","This is prep, not fatigue — keep it easy."]},
  {name:"Slow bodyweight squats", sets:"1 x 10", cues:["Feet shoulder width, toes slightly out.","Sit back and down, chest tall, knees tracking over toes.","Full depth if mobility allows, controlled tempo."]},
]};

const DEFAULT_PRANAYAMA_SHORT = {
  before: [
    {name:"Bhastrika (bellows breath)", sets:"1 x 3 min", cues:["Forceful equal inhale and exhale through the nose, about 1 breath/second.","3 rounds of 20 breaths, resting 15–20 sec between rounds.","Too intense at first? Substitute 20 slow diaphragmatic breaths instead."]}
  ],
  after: [
    {name:"Nadi Shodhana (alternate nostril breathing)", sets:"1 x 3 min", cues:["Close right nostril with thumb, inhale left.","Close left nostril with ring finger, exhale right, then inhale right.","Close right, exhale left — that's one round. Repeat slowly."]},
    {name:"Seated breath-awareness meditation", sets:"1 x 4 min", cues:["Sit comfortably, eyes closed.","Rest attention on the raw sensation of breathing — nostrils, chest, or belly.","When the mind wanders, just return to the breath, no judgment."]}
  ]
};

const DEFAULT_DAYS = [
  { id:1, title:"Push (Chest Priority)", skill:"Handstand", time:"~68 min", type:"strength",
    skillWork:[
      ex("Wall handstand hold (chest to wall)","5 x 25 sec","","",["Kick up facing the wall, chest close to it, hollow body, arms locked.","Squeeze glutes and brace the core — don't let your lower back arch.","Push through the shoulders, push the floor away."]),
      ex("Wall handstand hold (back to wall)","3 x 20 sec","","",["Walk your feet up the wall until your back is against it, hands set a comfortable distance away.","Point toes, squeeze the whole body tight, stack wrists-shoulders-hips.","This variant trains balance more than the chest-to-wall version."]),
      ex("Freestanding kick-up attempts","1 x 6 attempts","","",["Place hands shoulder width, fingers spread, one leg kicks up while the other drives off the floor.","Aim to find the balance point over your hands, not to hold long — bail forward safely if you overshoot.","Have a wall or a spotter nearby while you're learning this."])
    ],
    strength:[
      ex("Parallel bar dips","4 x 10","2-1-2","90s",["Lean forward slightly, elbows track back — this is a chest-biased dip.","Lower until shoulders are level with elbows, pause, then press up.","Keep shoulders down and away from your ears throughout.","Add a weighted backpack once 12+ reps feels easy."]),
      ex("Deep push-ups on blocks/parallettes","4 x 12","3-1-1","90s",["Hands on parallettes or blocks so your chest can dip below hand level.","Full range of motion — chest to the floor plane, then press all the way out.","Keep a straight line from head to heels, no sagging hips."]),
      ex("Pseudo planche push-ups","4 x 9","2-1-2","90s",["Hands turned slightly in, positioned by your hips/lower ribs rather than shoulders.","Lean your shoulders forward past your hands as you lower.","Keep the whole body rigid — this trains the planche shoulder position."]),
      ex("Typewriter push-ups (unilateral)","3 x 7","2-1-2","75s",["Wide hand placement, lower down and shift your weight to one straight arm.","Slide side to side at the bottom like a typewriter carriage, keeping chest low.","Push back to center and up — this overloads each side more than a symmetric push-up."]),
      ex("Diamond push-ups","3 x 13","2-1-2","60s",["Hands together under your chest, thumbs and index fingers touching (diamond shape).","Elbows track backward close to your ribs, not flared out.","Full lockout at the top, chest brushes the hands at the bottom."])
    ]},
  { id:2, title:"Pull (Back Thickness)", skill:"Front Lever", time:"~65 min", type:"strength",
    skillWork:[
      ex("Tuck front lever hold","5 x 15 sec","","",["Hang from the bar, pull your knees to your chest and lean your torso back to horizontal.","Keep arms straight, shoulder blades pulled down and back, ribs tucked (no arching).","The tighter the tuck, the easier — extend legs slightly as it gets manageable."]),
      ex("Advanced tuck front lever","3 x 10 sec","","",["Same setup as the tuck, but hips open slightly and knees move away from the chest.","Keep your lower back rounded, not arched, to protect the spine under load.","Progress here only once a clean 20 sec tuck hold is easy."]),
      ex("Dead hang","3 x 35 sec","","",["Full hang from the bar, arms straight, shoulders relaxed and slightly engaged (not fully passive).","Great for grip endurance and decompressing the spine between hard sets.","Breathe normally — don't hold your breath through the hold."])
    ],
    strength:[
      ex("Weighted-feel pull-ups (slow negative)","4 x 7","4-1-1","2 min",["Jump or step up to the top position, chin over the bar.","Lower yourself for a full 4-second count, fighting the descent the whole way.","Reset from a dead hang each rep — don't bounce."]),
      ex("Wide-grip pull-ups","3 x max","2-0-2","90s",["Hands just outside shoulder width.","Pull your chest toward the bar, driving elbows down and back, not just up.","Full extension at the bottom every rep — no partial reps."]),
      ex("Typewriter pull-ups (unilateral)","3 x 5","2-1-2","90s",["Pull up to the top and shift your chin toward one hand, then the other, staying up top.","Keep your core tight so you don't swing.","Lower under control at the end of the set."]),
      ex("Australian/inverted rows (feet elevated)","4 x 13","2-1-2","90s",["Bar or rings at waist height, body straight, feet elevated on a bench/box.","Pull your chest to the bar, squeezing shoulder blades together.","The more horizontal your body, the harder — adjust bar height for difficulty."]),
      ex("Bodyweight bar curls","3 x 11","2-1-2","60s",["Underhand grip on a low bar, lean back with a straight rigid body.","Curl your body up by bending only the elbows — torso and legs stay locked.","Lower with control back to a straight-arm lean."])
    ]},
  { id:3, title:"Legs + Core (Heavy)", skill:"L-sit", time:"~75 min", type:"strength",
    skillWork:[
      ex("Tuck L-sit hold","5 x 15 sec","","",["On parallettes or the floor, knees pulled to chest, hips lifted off the ground.","Push the floor away hard through straight arms, shoulders down.","Point your toes and keep your back tall, not rounded."]),
      ex("One-leg-extended L-sit","3 x 11 sec","","",["From the tuck position, straighten one leg out in front while keeping the other tucked.","Keep hips level — don't let one side dip lower than the other.","Alternate legs between sets."]),
      ex("Straddle L-sit attempts","3 x 7 sec","","",["Both legs extended and spread wide, toes pointed.","Push down hard through the hands, lift the hips as high as you can.","Harder on the hip flexors than a regular L-sit — build up gradually."])
    ],
    strength:[
      ex("Pistol squat progression (box or bar-assisted)","4 x 7","3-1-1","90s",["Stand on one leg, other leg extended forward, holding a bar/rail for balance if needed.","Sit back and down slowly, keeping the heel planted and knee tracking over the toes.","Use a box under you to control depth as you build the strength to go lower."]),
      ex("Bulgarian split squats (back foot elevated)","4 x 11","3-1-1","90s",["Rear foot up on a bench, front foot far enough forward for a 90° front knee.","Drop straight down, front knee tracking over the toes, torso upright.","Most of the work should be felt in the front leg, not the back."]),
      ex("Sissy squats","3 x 11","3-1-1","75s",["Hold a support for balance, rise onto the balls of your feet, knees pushed forward.","Lean back and lower your torso in a straight line as your knees bend deeply.","Control the descent — this is one of the best pure quad-mass builders in calisthenics."]),
      ex("Nordic curl negatives","3 x 7","4 sec down","90s",["Kneel with your ankles anchored (partner, bar, or fixed object).","Keeping hips extended, lower your torso forward as slowly as possible, resisting with the hamstrings.","Catch yourself with your hands at the bottom — this is a negative-only movement."]),
      ex("Standing calf raises","4 x 22","2-1-2","45s",["Stand on the edge of a step, heels hanging off.","Rise as high onto the toes as possible, pause, then lower below the step level for a full stretch.","Full range of motion matters more than speed here."]),
      ex("Hanging leg raises","3 x 13","2-0-2","60s",["Hang from the bar with straight arms, legs together.","Raise straight (or bent, if needed) legs until roughly parallel to the floor or higher.","Avoid swinging — control both the raise and the lower."])
    ]},
  { id:4, title:"Push (Shoulders/Triceps)", skill:"Planche", time:"~68 min", type:"strength",
    skillWork:[
      ex("Planche lean","5 x 17 sec","","",["Hands by your hips, fingers pointing forward or slightly out, arms straight.","Lean your shoulders forward past your hands as far as you can control.","Keep the whole body rigid — this builds the wrist and shoulder tolerance planche needs."]),
      ex("Tuck planche hold","5 x 10 sec","","",["From the lean position, bend the knees and lift both feet off the ground.","Round the upper back, protract the shoulder blades, keep arms locked straight.","Hips should be roughly level with or above the shoulders."]),
      ex("Frog stand","3 x 25 sec","","",["Squat down, place hands flat on the floor shoulder-width apart.","Rest your knees on the backs of your upper arms/elbows and lean forward to lift your feet.","A good introductory balance hold before pushing into tuck planche."])
    ],
    strength:[
      ex("Handstand push-up negatives (wall-assisted)","4 x 6","4 sec down","2 min",["Kick up into a wall handstand, chest or back to the wall.","Lower your head slowly toward the floor over a full 4-second count.","Walk feet down and reset, or press back up if you're able — over time work toward a free negative."]),
      ex("Pike push-ups (feet elevated)","4 x 11","3-1-1","90s",["Feet up on a bench, hips high in a pike position, hands under shoulders.","Lower your head toward the floor between your hands, elbows tracking back.","The more vertical your torso, the more shoulder-dominant this becomes."]),
      ex("Archer push-ups","4 x 9","2-1-2","90s",["Hands wide, one arm bends and takes the load while the other stays straight and slides out to the side.","Keep the straight arm's shoulder engaged, not just passively along for the ride.","Alternate sides each rep or each set."]),
      ex("Dips (upright torso, triceps focus)","3 x max","2-1-2","90s",["Torso upright rather than leaned forward, elbows tucked close to the body.","Lower until upper arms are roughly parallel to the ground.","Keep shoulders down away from ears throughout the set."]),
      ex("Korean dips","3 x 8","2-1-2","75s",["Hands on the bars behind you, legs out in front, torso upright.","Lower straight down, keeping the torso vertical (this is brutal on the triceps).","A more advanced, more upright variation than a standard dip."])
    ]},
  { id:5, title:"Pull (Back Width + Biceps)", skill:"Back Lever", time:"~65 min", type:"strength",
    skillWork:[
      ex("German hang","4 x 25 sec","","",["From a hang, rotate your shoulders so your arms turn behind you and your body hangs with shoulders internally rotated.","Relax into the stretch, breathing steadily.","This opens the shoulders needed for back lever — build up slowly, it's intense at first."]),
      ex("Tuck back lever hold","5 x 15 sec","","",["From German hang or a bar, invert so your back faces the floor, knees tucked to chest.","Arms straight, body roughly horizontal, hold the tuck position tight.","Keep the core braced so hips don't sag."]),
      ex("Advanced tuck back lever","3 x 11 sec","","",["Same as tuck back lever, but hips open and knees drift away from the chest slightly.","Body gets longer and the lever arm gets harder to hold.","Only progress here once the basic tuck hits 20 sec cleanly."])
    ],
    strength:[
      ex("Wide-grip pull-ups","4 x max","2-1-2","90s",["Hands outside shoulder width, full hang to chin-over-bar each rep.","Drive elbows down and back rather than just pulling up with the arms.","Prioritize full range over speed."]),
      ex("Chin-ups (underhand, biceps focus)","4 x 9","3-1-1","90s",["Underhand grip, shoulder width.","Pull your chest to the bar, leading with the chest rather than the chin.","Slow the lowering phase to maximize the biceps' time under tension."]),
      ex("L-sit pull-ups","3 x 6","2-0-2","90s",["Hold an L-sit position (legs out straight, hips flexed) for the entire pull-up.","Pull up without losing the leg position or swinging.","A serious core + back combination — regress to bent-knee if needed."]),
      ex("Commando pull-ups (alternating side to side)","3 x 7","2-1-2","90s",["Hang with one hand in front of the other on the bar (or both on a single vertical bar).","Pull up so one ear passes the bar, lower, then pull up to the other side.","Alternate sides each rep."]),
      ex("Bodyweight rows (feet elevated)","3 x 13","2-1-2","60s",["Lower bar height and elevated feet increase the horizontal pull difficulty.","Pull chest to the bar, squeezing shoulder blades together at the top.","Keep the body in a straight line — no hip sag."])
    ]},
  { id:6, title:"Full Body Power + Skills", skill:"Elbow Lever", time:"~60 min", type:"power",
    skillWork:[
      ex("Elbow lever hold","5 x 15 sec","","",["Place hands on the floor, fingers pointing forward, elbows tucked into the sides of your stomach.","Lean forward and lift your feet off the ground, balancing on your hands.","Keep the body as straight as possible, looking slightly forward, not straight down."]),
      ex("L-sit progression (extra volume)","1 x 9 min","","",["Extra practice volume today — mix tuck, one-leg, and straddle attempts across short sets.","Prioritize quality holds over quantity; rest fully between attempts.","Use parallettes if available to keep wrists happier."]),
      ex("Freestanding handstand practice","1 x 9 attempts","","",["Kick up to a freestanding handstand, aiming to find the balance point without a wall.","Make small finger/wrist adjustments to balance rather than big hip shifts.","Bail forward safely (cartwheel out or step down) any time you lose the line."])
    ],
    strength:[
      ex("Explosive push-ups (hands leave ground)","4 x 9","fast","90s",["Lower normally, then push explosively so your hands leave the floor.","Land softly with bent elbows to absorb the impact.","Keep reps crisp and fast — stop the set if speed starts dropping off."]),
      ex("Explosive pull-ups (chest to bar, fast)","4 x 5","fast","2 min",["Pull as fast as possible so your chest reaches the bar with some momentum, not just a slow grind.","Control the descent even though the pull is explosive.","This builds the power base a muscle-up eventually needs."]),
      ex("Dips","3 x max","","90s",["Standard dip form, whichever style (chest-lean or upright) you haven't emphasized this week.","Full range of motion, controlled at the bottom.","Go to a true near-max effort on this set."]),
      ex("Jump squats","3 x 15","explosive","60s",["Squat to about parallel, then jump straight up as high as possible.","Land softly, absorbing through the whole foot and re-bending the knees.","Reset your stance between reps if needed."]),
      ex("Dragon flag progression (start tuck)","4 x 6","slow","60s",["Lie on a bench, hold behind your head for support, lift hips and legs off the bench keeping the body rigid.","Start with knees tucked toward the chest if the full straight-leg version is too hard.","Lower as slowly as you can control — this is a pure core-strength movement."]),
      ex("Plank hold","3 x 50 sec","","45s",["Forearms on the ground, body in a straight line from head to heels.","Squeeze glutes and brace the abs like you're about to be poked in the stomach.","Don't let the hips sag or pike up."])
    ]}
];

const DEFAULT_YOGA_DAY = { type:"yoga", time:"~48 min",
  flow:[
    {name:"Sun Salutations (Surya Namaskar)", sets:"1 x 4", cues:["Move through the classic sequence — mountain, forward fold, plank, cobra/up-dog, downward dog, back to standing.","Sync one breath to one movement, no rushing.","Keep the pace gentle — this is a warm-up flow, not conditioning."]},
    {name:"Downward dog to cobra flow", sets:"5 sec", cues:["From downward dog, shift forward through a low plank into cobra, chest lifting, hips low.","Push back to downward dog to complete one round.","Keep shoulders away from ears and breathe steadily through the transitions."]},
    {name:"Pigeon pose", sets:"2 x 90 sec", cues:["Front shin angled in front of the hips, back leg extended straight behind.","Square the hips forward as much as comfortable, fold forward over the front leg.","A deep hip opener — ease in gradually, never force the knee."]},
    {name:"Seated forward fold", sets:"1 x 90 sec", cues:["Legs extended straight in front, hinge from the hips (not the lower back) to fold forward.","Let the head and neck relax, hands resting on shins/feet/floor wherever comfortable.","Breathe into the backs of the legs rather than forcing the reach."]},
    {name:"Shoulder/chest opener (wall or doorway)", sets:"2 x 90 sec", cues:["Place forearm on a wall or doorframe at shoulder height, elbow bent 90°.","Rotate your body away from the wall until you feel a stretch across the chest/front shoulder.","Directly supports handstand, planche, and lever shoulder mobility."]},
    {name:"Spinal twist (seated or supine)", sets:"2 x 60 sec", cues:["Seated or lying on your back, rotate the spine while keeping both shoulders grounded.","Let gravity deepen the twist rather than forcing it with the arms.","Switch sides evenly."]},
    {name:"Child's pose", sets:"1 x 90 sec", cues:["Kneel and sit back toward the heels, arms extended forward, forehead down.","Let the lower back round and release completely.","A full reset — breathe slow and long here to close the flow."]}
  ],
  pranayama:[
    {name:"Nadi Shodhana (alternate nostril breathing)", sets:"1 x 5 min", cues:["Same technique as the daily short version, extended to a full 5 minutes.","Keep the breath smooth and even on both sides.","Let the pace slow down naturally as you settle in."]},
    {name:"Bhramari (humming bee breath)", sets:"1 x 5 min", cues:["Lightly cover your ears, inhale normally through the nose.","Exhale slowly while humming a steady, gentle tone.","Deeply calming for the nervous system — let the vibration relax the face and jaw."]}
  ],
  meditation:[
    {name:"Seated meditation / body scan", sets:"1 x 18 min", cues:["Seated breath-awareness meditation, or a simple body scan.","Mentally move attention slowly from feet to head, noticing sensation without judgment.","No fixed technique needed beyond steady, patient attention."]}
  ]
};

let WARMUP = JSON.parse(JSON.stringify(DEFAULT_WARMUP));
let PRANAYAMA_SHORT = JSON.parse(JSON.stringify(DEFAULT_PRANAYAMA_SHORT));
let DAYS = JSON.parse(JSON.stringify(DEFAULT_DAYS));
let YOGA_DAY = JSON.parse(JSON.stringify(DEFAULT_YOGA_DAY));

const OPTIONAL_ADDONS = [
  {day:"Day 1 or 4", items:"Band lateral raises / band face pulls (shoulder health)"},
  {day:"Day 5", items:"Band rear delt fly / band straight-arm pulldown"},
  {day:"Day 3", items:"Reverse crunch / single-leg glute bridge"},
  {day:"Day 6", items:"Walking lunges"}
];
const PHASES = [
  {label:"Phase 1 · 0–3 months", skills:"Wall handstand hold · Crow pose/frog stand · Tuck L-sit · Elbow lever · Tuck front lever"},
  {label:"Phase 2 · 3–6 months", skills:"Freestanding handstand · Straddle L-sit · Advanced tuck front lever · Tuck back lever · Handstand push-up (wall-assisted → free)"},
  {label:"Phase 3 · 6–12 months", skills:"Full front lever · Full back lever · Muscle-up · Tuck planche"},
  {label:"Phase 4 · 1–2 years+", skills:"Full planche · One-arm pull-up progression · One-arm push-up progression · Human flag"}
];
const OVERLOAD_RULES = [
  "Add 1–2 reps to a set.","Add 1 more set.","Slow the tempo (especially the lowering phase — 3–5 sec).",
  "Increase range of motion (deeper squat, fuller dip).","Move to a harder variation once you hit the top of the rep range with good form.",
  "Once bodyweight reps exceed ~15–20 with ease, add load via a weighted backpack (dips, pull-ups, push-ups all take it well)."
];
const MET = {strength:6, power:8, yoga:3};

const LEVELS = [
  {level:1, xp:0, title:'Ground Zero'},
  {level:2, xp:100, title:'Warm Body'},
  {level:3, xp:250, title:'Bar Novice'},
  {level:4, xp:500, title:'Iron Apprentice'},
  {level:5, xp:900, title:'Tension Builder'},
  {level:6, xp:1400, title:'Skill Seeker'},
  {level:7, xp:2000, title:'Lever Adept'},
  {level:8, xp:2800, title:'Planche Contender'},
  {level:9, xp:3800, title:'Calisthenics Athlete'},
  {level:10, xp:5000, title:'Apparatus Master'}
];
const XP_RULES = { exerciseLog:8, dayComplete:40, prBonus:20, badgeBonus:25, measureLog:10, streakCap:10, streakPerDay:2 };

const BADGES = [
  {id:'first_rep', icon:'🔰', name:'First Rep', desc:'Log your first exercise session.', cond:c=>c.totalSessions>=1},
  {id:'day_one', icon:'🏁', name:'Day One', desc:'Complete your first full training day.', cond:c=>c.daysCompleted>=1},
  {id:'streak_3', icon:'🔥', name:'Momentum', desc:'Hit a 3-day streak.', cond:c=>c.longestStreak>=3},
  {id:'streak_7', icon:'🔥🔥', name:'One Week Strong', desc:'Hit a 7-day streak.', cond:c=>c.longestStreak>=7},
  {id:'streak_30', icon:'🏆', name:'Iron Habit', desc:'Hit a 30-day streak.', cond:c=>c.longestStreak>=30},
  {id:'streak_100', icon:'💎', name:'Unbreakable', desc:'Hit a 100-day streak.', cond:c=>c.longestStreak>=100},
  {id:'pr_1', icon:'📈', name:'New Record', desc:'Beat a previous best for the first time.', cond:c=>c.prCount>=1},
  {id:'pr_10', icon:'🚀', name:'Record Breaker', desc:'Set 10 personal records.', cond:c=>c.prCount>=10},
  {id:'volume_1000', icon:'🏋️', name:'Volume Warrior', desc:'Lift 1,000 kg·reps of total volume.', cond:c=>c.totalVolume>=1000},
  {id:'volume_10000', icon:'⚙️', name:'Iron Mill', desc:'Lift 10,000 kg·reps of total volume.', cond:c=>c.totalVolume>=10000},
  {id:'sessions_50', icon:'🎯', name:'Half Century', desc:'Log 50 exercise sessions.', cond:c=>c.totalSessions>=50},
  {id:'sessions_200', icon:'🧱', name:'Foundation Built', desc:'Log 200 exercise sessions.', cond:c=>c.totalSessions>=200},
  {id:'hold_20', icon:'⏱️', name:'Twenty Second Club', desc:'Hold any skill position for 20+ seconds.', cond:c=>c.bestHold>=20},
  {id:'hold_45', icon:'🗿', name:'Iron Stillness', desc:'Hold any skill position for 45+ seconds.', cond:c=>c.bestHold>=45},
  {id:'zen_5', icon:'🧘', name:'Zen Mode', desc:'Complete the yoga day 5 times.', cond:c=>c.yogaCount>=5},
  {id:'measure_1', icon:'📏', name:'Tracking Gains', desc:'Log your first body measurement.', cond:c=>c.measurementsCount>=1},
  {id:'measure_5', icon:'📊', name:'Data Doesn\'t Lie', desc:'Log 5 body measurement check-ins.', cond:c=>c.measurementsCount>=5},
  {id:'week_goal', icon:'✅', name:'Goal Getter', desc:'Hit your weekly training-day goal.', cond:c=>c.weekGoalHit},
  {id:'all_days', icon:'🗓️', name:'Full Circle', desc:'Complete all 7 day types at least once.', cond:c=>c.uniqueDaysCompleted>=7}
];

const QUOTES = [
  "Nobody sees the reps you did alone — your body will.",
  "Consistency beats intensity. Show up again tomorrow.",
  "The bar doesn't care how you feel. Grab it anyway.",
  "Every skill hold you've ever nailed started as a failed attempt.",
  "Strength is a habit before it's a look.",
  "You don't need a perfect session. You need a logged one.",
  "The tuck gets you the advanced tuck. The advanced tuck gets you the full lever.",
  "Discipline is remembering what you want, five minutes from now.",
  "A rest day well spent is still training.",
  "Small reps, done daily, beat huge reps done rarely.",
  "Your future self is trained by today's decision to show up.",
  "Progress hides in the sets you almost skipped.",
  "Shredded is just consistent, over a long enough timeline.",
  "The skill roadmap is long. Today you only need one square of it.",
  "Breathe first. Then lift. Then breathe again.",
  "You are one honest session away from momentum.",
  "The body follows the calendar, not the mood.",
  "Chalk up. Show up. Log it. Repeat.",
  "You're not behind. You're mid-build.",
  "The version of you that has the front lever trains today, tired or not."
];

function todayQuote(){
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(),0,0))/86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

function getLevelInfo(xp){
  let cur = LEVELS[0];
  for(const l of LEVELS){ if(xp>=l.xp) cur = l; }
  const idx = LEVELS.indexOf(cur);
  const next = LEVELS[idx+1] || null;
  const pct = next ? Math.round(((xp-cur.xp)/(next.xp-cur.xp))*100) : 100;
  return {level:cur.level, title:cur.title, xp, nextXp: next? next.xp : null, pct};
}
