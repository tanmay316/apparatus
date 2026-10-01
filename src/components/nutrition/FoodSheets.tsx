import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Bookmark, BookmarkCheck, Minus, Plus, Footprints, Dumbbell, Sparkles, Flame, ChevronRight, Apple, PenLine, Heart, Check, X, ListPlus } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { LOCAL_FOODS, portion, searchLocal, searchOpenFoodFacts, type FoodEntry, type Macros } from '@/lib/food-db';
import { foodHealthScore } from '@/lib/nutrition-plan';
import { mealTypeForNow, type SavedFood } from '@/services/nutrition-setup';
import { CalSheet, MACRO_META } from './cal-ui';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** A food picked for a multi-food log, with its portion. */
export interface BasketItem { food: FoodEntry; grams: number }

export function basketTotals(items: BasketItem[]): Macros {
  return items.reduce<Macros>((t, { food, grams }) => {
    const m = portion(food.per100, grams);
    return { calories: t.calories + m.calories, protein: t.protein + m.protein, carbs: t.carbs + m.carbs, fat: t.fat + m.fat, fiber: t.fiber + m.fiber };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

export function savedToEntry(s: SavedFood): FoodEntry {
  return { id: s.id, name: s.name, brand: s.brand, per100: s.per100, serving: s.serving, source: 'saved' };
}

function FoodRow({ food, selected, onClick, onToggle }: { food: FoodEntry; selected: boolean; onClick: () => void; onToggle: () => void }) {
  const kcal = portion(food.per100, food.serving.grams).calories;
  return (
    <div className="cal-card-2" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, outline: selected ? '2px solid var(--cal-primary)' : undefined, outlineOffset: -2 }}>
      <button type="button" onClick={onClick} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
        {food.image ? (
          <img src={food.image} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: 'var(--cal-card)' }} />
        ) : (
          <span className="cal-option-icon" style={{ width: 40, height: 40, borderRadius: 10 }}><Apple size={17} /></span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{food.name}</span>
          <span className="cal-muted" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Flame size={12} /> {kcal} cal · {food.brand ? `${food.brand} · ` : ''}{food.serving.label}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={selected ? `Remove ${food.name} from list` : `Add ${food.name} to list`}
        aria-pressed={selected}
        style={{ width: 34, height: 34, borderRadius: 34, background: selected ? 'var(--cal-primary)' : 'var(--cal-card)', color: selected ? 'var(--cal-on-primary)' : 'var(--cal-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        {selected ? <Check size={16} /> : <Plus size={16} />}
      </button>
    </div>
  );
}

export function FoodSearchSheet({ initialTab = 'all', saved, basket, onPick, onToggle, onReview, onQuickAdd, onClose }: {
  initialTab?: 'all' | 'saved'; saved: SavedFood[]; basket: BasketItem[];
  onPick: (f: FoodEntry) => void; onToggle: (f: FoodEntry) => void; onReview: () => void; onQuickAdd: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const local = useMemo(() => (q.trim() ? searchLocal(q) : LOCAL_FOODS.slice(0, 14)), [q]);
  const savedList = useMemo(() => {
    const n = q.trim().toLowerCase();
    return saved.map(savedToEntry).filter(f => !n || f.name.toLowerCase().includes(n));
  }, [saved, q]);

  useEffect(() => {
    if (tab !== 'all' || q.trim().length < 3) {
      setRemote([]);
      setError('');
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        setRemote(await searchOpenFoodFacts(q, ctrl.signal));
        setError('');
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError('Online food search is unavailable right now.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => { ctrl.abort(); window.clearTimeout(t); };
  }, [q, tab]);

  const picked = new Set(basket.map(b => b.food.id));
  const row = (f: FoodEntry) => <FoodRow key={f.id} food={f} selected={picked.has(f.id)} onClick={() => onPick(f)} onToggle={() => onToggle(f)} />;
  const basketCal = Math.round(basketTotals(basket).calories);

  return (
    <CalSheet
      title="Log food"
      onClose={onClose}
      footer={basket.length > 0 ? (
        <button type="button" className="cal-btn" style={{ width: '100%' }} onClick={onReview}>
          Review {basket.length} {basket.length === 1 ? 'food' : 'foods'} · {basketCal.toLocaleString()} cal
        </button>
      ) : undefined}
    >
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={17} className="cal-muted" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value.slice(0, 80))} placeholder="Describe what you ate" className="cal-input" style={{ paddingLeft: 40, fontWeight: 500 }} />
      </div>
      <div className="cal-seg" role="tablist" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>All</button>
        <button type="button" role="tab" aria-selected={tab === 'saved'} onClick={() => setTab('saved')}>Saved foods</button>
      </div>

      {tab === 'all' ? (
        <>
          <button type="button" onClick={onQuickAdd} className="cal-card-2" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 14, textAlign: 'left' }}>
            <span className="cal-option-icon" style={{ width: 40, height: 40, borderRadius: 10 }}><PenLine size={17} /></span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Quick add calories</span>
            <ChevronRight size={18} className="cal-muted" />
          </button>
          <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700, margin: '4px 2px 8px' }}>{q.trim() ? 'Common foods' : 'Suggestions'} · tap + to pick several</div>
          {local.map(row)}
          {q.trim().length >= 3 && (
            <>
              <div className="cal-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, margin: '14px 2px 8px' }}>
                Packaged foods {loading && <Loader2 size={13} className="animate-spin" />}
              </div>
              {remote.map(row)}
              {!loading && !error && remote.length === 0 && <div className="cal-muted" style={{ fontSize: 13, padding: '4px 2px' }}>No packaged foods found.</div>}
              {error && <div style={{ fontSize: 13, padding: '4px 2px', color: 'var(--cal-bad)' }}>{error}</div>}
              <div className="cal-muted" style={{ fontSize: 11, marginTop: 10 }}>Packaged food data from Open Food Facts.</div>
            </>
          )}
          {q.trim() && local.length === 0 && q.trim().length < 3 && <div className="cal-muted" style={{ fontSize: 13 }}>Keep typing to search more foods…</div>}
        </>
      ) : savedList.length ? (
        savedList.map(row)
      ) : (
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
          <Bookmark size={28} style={{ margin: '0 auto' }} className="cal-muted" />
          <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700 }}>No saved foods yet</div>
          <div className="cal-muted" style={{ marginTop: 4, fontSize: 13 }}>Tap the bookmark on any food or meal to save it here.</div>
        </div>
      )}
    </CalSheet>
  );
}

export function MacroTiles({ m, size = 'md' }: { m: Macros; size?: 'md' | 'sm' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {(['protein', 'carbs', 'fat'] as const).map(k => {
        const M = MACRO_META[k];
        return (
          <div key={k} className="cal-card-2" style={{ padding: size === 'sm' ? '10px 10px' : '12px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }} className="cal-muted"><M.icon size={13} color={M.color} /> {M.label}</div>
            <div className="cal-tabular" style={{ marginTop: 4, fontSize: size === 'sm' ? 16 : 18, fontWeight: 800 }}>{Math.round(m[k])}g</div>
          </div>
        );
      })}
    </div>
  );
}

export function HealthScoreBar({ score }: { score: number }) {
  const color = score >= 7 ? 'var(--cal-good)' : score >= 5 ? 'var(--cal-carbs)' : 'var(--cal-bad)';
  return (
    <div className="cal-card-2" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
        <Heart size={15} color="var(--cal-protein)" /> Health score
        <span className="cal-tabular" style={{ marginLeft: 'auto' }}>{score}/10</span>
      </div>
      <div style={{ marginTop: 8, height: 6, borderRadius: 6, background: 'var(--cal-card)' }}>
        <div style={{ width: `${score * 10}%`, height: '100%', borderRadius: 6, background: color }} />
      </div>
    </div>
  );
}

export function MealTypeChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="cal-seg" role="tablist">
      {MEAL_TYPES.map(t => (
        <button key={t} type="button" role="tab" aria-selected={value === t} onClick={() => onChange(t)} style={{ textTransform: 'capitalize', fontSize: 13 }}>{t}</button>
      ))}
    </div>
  );
}

export function FoodPortionSheet({ food, isSaved, initialGrams, initialMealType, onToggleSave, onLog, onAddToList, onClose }: {
  food: FoodEntry; isSaved: boolean; initialGrams?: number; initialMealType?: string;
  onToggleSave: () => void; onLog: (grams: number, mealType: string) => Promise<void>; onAddToList?: (grams: number) => void; onClose: () => void;
}) {
  const startGrams = initialGrams ?? food.serving.grams;
  const [unit, setUnit] = useState<'serving' | 'g'>(
    (food.serving.grams === 100 && food.serving.label.startsWith('100')) || startGrams % food.serving.grams !== 0 ? 'g' : 'serving',
  );
  const [servings, setServings] = useState(Math.max(0.25, startGrams / food.serving.grams));
  const [grams, setGrams] = useState(String(Math.round(startGrams)));
  const [mealType, setMealType] = useState(initialMealType || mealTypeForNow());
  const [busy, setBusy] = useState(false);
  const g = unit === 'serving' ? servings * food.serving.grams : Math.max(0, Number(grams) || 0);
  const m = portion(food.per100, g);
  const score = foodHealthScore(m);
  const valid = g > 0 && g <= 5000;

  return (
    <CalSheet
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food.name}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onToggleSave} className="cal-btn-ghost" aria-label={isSaved ? 'Remove from saved foods' : 'Save food'} style={{ width: 56, padding: 0, height: 56 }}>
            {isSaved ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
          </button>
          {onAddToList && (
            <button type="button" className="cal-btn-ghost" disabled={!valid || busy} onClick={() => onAddToList(g)} style={{ height: 56, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <ListPlus size={18} /> Add to list
            </button>
          )}
          <button type="button" className="cal-btn" style={{ flex: 1 }} disabled={!valid || busy} onClick={async () => { setBusy(true); try { await onLog(g, mealType); } finally { setBusy(false); } }}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : 'Log'}
          </button>
        </div>
      }
    >
      {food.brand && <div className="cal-muted" style={{ fontSize: 13, fontWeight: 600, marginTop: -4, marginBottom: 12 }}>{food.brand}</div>}
      <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Measurement</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { id: 'serving' as const, label: food.serving.label },
          { id: 'g' as const, label: 'Grams' },
        ].map(o => (
          <button key={o.id} type="button" onClick={() => setUnit(o.id)} style={{ height: 38, padding: '0 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, background: unit === o.id ? 'var(--cal-primary)' : 'var(--cal-card-2)', color: unit === o.id ? 'var(--cal-on-primary)' : 'var(--cal-text)' }}>{o.label}</button>
        ))}
      </div>
      {unit === 'serving' ? (
        <div className="cal-card-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Number of servings</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="cal-icon-btn" style={{ width: 34, height: 34, background: 'var(--cal-card)' }} onClick={() => setServings(s => Math.max(0.25, Math.round((s - 0.5) * 4) / 4))} aria-label="Fewer servings"><Minus size={15} /></button>
            <span className="cal-tabular" style={{ minWidth: 34, textAlign: 'center', fontSize: 17, fontWeight: 800 }}>{servings}</span>
            <button type="button" className="cal-icon-btn" style={{ width: 34, height: 34, background: 'var(--cal-card)' }} onClick={() => setServings(s => Math.min(20, Math.round((s + 0.5) * 4) / 4))} aria-label="More servings"><Plus size={15} /></button>
          </span>
        </div>
      ) : (
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input inputMode="decimal" className="cal-input cal-tabular" value={grams} onChange={e => setGrams(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} />
          <span className="cal-muted" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontWeight: 600 }}>g</span>
        </div>
      )}

      <div className="cal-card-2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 8 }}>
        <span className="cal-option-icon" style={{ width: 42, height: 42, background: 'var(--cal-card)' }}><Flame size={19} /></span>
        <div>
          <div className="cal-muted" style={{ fontSize: 13, fontWeight: 600 }}>Calories</div>
          <div className="cal-tabular" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{m.calories}</div>
        </div>
        <div className="cal-muted cal-tabular" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{Math.round(g)} g</div>
      </div>
      <MacroTiles m={m} />
      <div style={{ marginTop: 8 }}><HealthScoreBar score={score} /></div>
      <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px' }}>Meal</div>
      <MealTypeChips value={mealType} onChange={setMealType} />
    </CalSheet>
  );
}

export function QuickAddSheet({ initialMealType, onLog, onClose }: { initialMealType?: string; onLog: (name: string, m: Macros, mealType: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [vals, setVals] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [mealType, setMealType] = useState(initialMealType || mealTypeForNow());
  const [busy, setBusy] = useState(false);
  const cal = Number(vals.calories);
  const valid = cal > 0 && cal <= 10000;
  const field = (k: keyof typeof vals, label: string, unit: string) => (
    <label style={{ display: 'block' }}>
      <span className="cal-muted" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <input inputMode="decimal" className="cal-input cal-tabular" value={vals[k]} onChange={e => setVals(v => ({ ...v, [k]: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) }))} placeholder="0" />
        <span className="cal-muted" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600 }}>{unit}</span>
      </span>
    </label>
  );
  return (
    <CalSheet
      title="Quick add"
      onClose={onClose}
      footer={
        <button type="button" className="cal-btn" style={{ width: '100%' }} disabled={!valid || busy} onClick={async () => {
          setBusy(true);
          try {
            await onLog(name.trim() || 'Quick add', { calories: cal, protein: Number(vals.protein) || 0, carbs: Number(vals.carbs) || 0, fat: Number(vals.fat) || 0, fiber: 0 }, mealType);
          } finally { setBusy(false); }
        }}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : 'Log'}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'block' }}>
          <span className="cal-muted" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Name</span>
          <input className="cal-input" value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="e.g. Homemade sandwich" style={{ fontWeight: 500 }} />
        </label>
        {field('calories', 'Calories', 'kcal')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {field('protein', 'Protein', 'g')}
          {field('carbs', 'Carbs', 'g')}
          {field('fat', 'Fats', 'g')}
        </div>
        <MealTypeChips value={mealType} onChange={setMealType} />
      </div>
    </CalSheet>
  );
}

/** Review several picked foods, adjust portions and log them together as one meal. */
export function MultiLogSheet({ items, initialMealType, onChange, onRemove, onEdit, onAddMore, onLog, onClose }: {
  items: BasketItem[]; initialMealType?: string;
  onChange: (id: string, grams: number) => void; onRemove: (id: string) => void; onEdit: (item: BasketItem) => void;
  onAddMore: () => void; onLog: (mealType: string) => Promise<void>; onClose: () => void;
}) {
  const [mealType, setMealType] = useState(initialMealType || mealTypeForNow());
  const [busy, setBusy] = useState(false);
  const t = basketTotals(items);
  const step = (b: BasketItem, dir: 1 | -1) => {
    const s = b.food.serving.grams;
    const next = Math.round((b.grams / s + dir * 0.5) * 4) / 4;
    onChange(b.food.id, Math.max(0.25, Math.min(20, next)) * s);
  };

  return (
    <CalSheet
      title={`Log ${items.length} ${items.length === 1 ? 'food' : 'foods'}`}
      onClose={onClose}
      footer={
        <button type="button" className="cal-btn" style={{ width: '100%' }} disabled={!items.length || busy} onClick={async () => { setBusy(true); try { await onLog(mealType); } finally { setBusy(false); } }}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : `Log to ${mealType}`}
        </button>
      }
    >
      <div className="cal-card-2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 8 }}>
        <span className="cal-option-icon" style={{ width: 42, height: 42, background: 'var(--cal-card)' }}><Flame size={19} /></span>
        <div>
          <div className="cal-muted" style={{ fontSize: 13, fontWeight: 600 }}>Total calories</div>
          <div className="cal-tabular" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{Math.round(t.calories).toLocaleString()}</div>
        </div>
      </div>
      <MacroTiles m={t} />

      <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px' }}>Meal</div>
      <MealTypeChips value={mealType} onChange={setMealType} />

      <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px' }}>Foods</div>
      {items.map(b => {
        const m = portion(b.food.per100, b.grams);
        const servings = Math.round((b.grams / b.food.serving.grams) * 100) / 100;
        return (
          <div key={b.food.id} className="cal-card-2" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 8 }}>
            <button type="button" onClick={() => onEdit(b)} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.food.name}</span>
              <span className="cal-muted cal-tabular" style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{m.calories} cal · {Math.round(b.grams)} g · P {Math.round(m.protein)} C {Math.round(m.carbs)} F {Math.round(m.fat)}</span>
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button type="button" className="cal-icon-btn" style={{ width: 30, height: 30, background: 'var(--cal-card)' }} onClick={() => step(b, -1)} aria-label={`Less ${b.food.name}`}><Minus size={14} /></button>
              <span className="cal-tabular" style={{ minWidth: 30, textAlign: 'center', fontSize: 14, fontWeight: 800 }} title={b.food.serving.label}>{servings}×</span>
              <button type="button" className="cal-icon-btn" style={{ width: 30, height: 30, background: 'var(--cal-card)' }} onClick={() => step(b, 1)} aria-label={`More ${b.food.name}`}><Plus size={14} /></button>
              <button type="button" className="cal-icon-btn" style={{ width: 30, height: 30 }} onClick={() => onRemove(b.food.id)} aria-label={`Remove ${b.food.name}`}><X size={14} /></button>
            </span>
          </div>
        );
      })}
      <button type="button" onClick={onAddMore} className="cal-btn-ghost" style={{ width: '100%', height: 46, marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14 }}>
        <Plus size={16} /> Add more foods
      </button>
    </CalSheet>
  );
}

export function ExerciseSheet({ burned, onManual, onClose }: {
  burned: { workouts: number; cardio: number; steps?: number; manual: number }; onManual: (kcal: number) => Promise<void>; onClose: () => void;
}) {
  const navigate = useNavigate();
  const [manual, setManual] = useState(false);
  const [kcal, setKcal] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const total = burned.workouts + burned.cardio + (burned.steps || 0) + burned.manual;
  const n = Number(kcal);

  const options = [
    { icon: Footprints, label: 'Run, walk or ride', sub: 'Track it live with GPS', go: () => navigate('/cardio') },
    { icon: Dumbbell, label: 'Weight lifting', sub: 'Start a gym session', go: () => navigate('/') },
    { icon: Sparkles, label: 'Describe', sub: 'Tell Astra what you did', go: () => window.dispatchEvent(new Event('open-ai-bot')) },
    { icon: PenLine, label: 'Manual', sub: 'Enter calories burned', go: () => { setManual(true); setTimeout(() => inputRef.current?.focus(), 50); } },
  ];

  return (
    <CalSheet title="Log exercise" onClose={onClose}>
      <div className="cal-card-2" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}><Flame size={16} /> Burned today <span className="cal-tabular" style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800 }}>{total} cal</span></div>
        <div className="cal-muted cal-tabular" style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12.5, fontWeight: 600 }}>
          <span>Workouts {burned.workouts}</span><span>Cardio {burned.cardio}</span><span>Steps {burned.steps || 0}</span><span>Manual {burned.manual}</span>
        </div>
      </div>
      {options.map(o => (
        <button key={o.label} type="button" onClick={() => { o.go(); if (o.label !== 'Manual') onClose(); }} className="cal-card-2" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px', marginBottom: 8, textAlign: 'left' }}>
          <span className="cal-option-icon" style={{ width: 42, height: 42, background: 'var(--cal-card)' }}><o.icon size={18} /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{o.label}</span>
            <span className="cal-muted" style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{o.sub}</span>
          </span>
          <ChevronRight size={18} className="cal-muted" />
        </button>
      ))}
      {manual && (
        <form
          onSubmit={async e => {
            e.preventDefault();
            if (!(n > 0 && n <= 5000)) return;
            setBusy(true);
            try { await onManual(Math.round(n)); setKcal(''); setManual(false); } finally { setBusy(false); }
          }}
          style={{ display: 'flex', gap: 8, marginTop: 6 }}
        >
          <input ref={inputRef} inputMode="numeric" className="cal-input cal-tabular" placeholder="Calories burned" value={kcal} onChange={e => setKcal(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <button type="submit" className="cal-btn" style={{ height: 52 }} disabled={!(n > 0 && n <= 5000) || busy}>Add</button>
        </form>
      )}
      <p className="cal-muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>Workouts and cardio you track in Apparatus are added automatically.</p>
    </CalSheet>
  );
}
