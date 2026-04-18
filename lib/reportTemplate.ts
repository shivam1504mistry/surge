/**
 * reportTemplate.ts
 * Generates the HTML string for a single-day Surge PDF report.
 * Used by generateReport.ts which calls expo-print to convert HTML → PDF.
 */

export interface ReportSet {
  weight_kg: number
  reps:      number
  is_pr?:    boolean
}

export interface ReportExercise {
  name: string
  sets: ReportSet[]
}

export interface ReportFoodItem {
  food_name:    string
  serving_size: number
  serving_unit: string
  calories:     number
}

export interface ReportMeal {
  slot:  string
  items: ReportFoodItem[]
}

export interface ReportDay {
  date:          string          // display string e.g. "Friday, 18 Apr 2026"
  athleteName:   string
  athleteGoal:   string
  weightKg:      number
  receiverName?: string
  appLink?:      string

  // Nutrition
  calories:         number
  protein_g:        number
  carbs_g:          number
  fat_g:            number
  calorie_target:   number
  protein_target_g: number
  carbs_target_g:   number
  fat_target_g:     number
  meals:            ReportMeal[]

  // Workout (may be empty if rest day)
  sessionName?: string
  exercises:    ReportExercise[]
}

// ---------------------------------------------------------------------------

function pct(value: number, target: number): number {
  if (!target) return 0
  return Math.min(100, Math.round((value / target) * 100))
}

function bar(value: number, target: number, color: string): string {
  const p = pct(value, target)
  return `
    <div class="bar-track">
      <div class="bar-fill" style="width:${p}%;background:${color}"></div>
    </div>
  `
}

export function buildDayHTML(day: ReportDay, generatedAt: string): string {
  const caloriesPct   = pct(day.calories,   day.calorie_target)
  const proteinPct    = pct(day.protein_g,  day.protein_target_g)
  const carbsPct      = pct(day.carbs_g,    day.carbs_target_g)
  const fatPct        = pct(day.fat_g,      day.fat_target_g)

  const mealsHTML = day.meals.map(meal => {
    if (!meal.items.length) return ''
    const itemsHTML = meal.items.map(item => `
      <div class="food-item">
        <div>
          <div class="food-name">${item.food_name}</div>
          <div class="food-serving">${item.serving_size} ${item.serving_unit}</div>
        </div>
        <div class="food-cals">${item.calories} kcal</div>
      </div>
    `).join('')
    const label = meal.slot.charAt(0).toUpperCase() + meal.slot.slice(1)
    return `
      <div class="meal">
        <div class="meal-slot">${label}</div>
        ${itemsHTML}
      </div>
    `
  }).join('')

  const exercisesHTML = day.exercises.map(ex => {
    const setsHTML = ex.sets.map(s => {
      const pr = s.is_pr ? ` <span class="pr-chip">⚡ PR</span>` : ''
      return `<span class="set-chip">${s.weight_kg}kg × ${s.reps}</span>${pr}`
    }).join('')
    return `
      <div class="exercise">
        <div class="exercise-name">${ex.name}</div>
        <div class="sets-row">${setsHTML}</div>
      </div>
    `
  }).join('')

  const workoutSection = day.exercises.length > 0 ? `
    <div class="section">
      <div class="section-title">Workout${day.sessionName ? ' · ' + day.sessionName : ''}</div>
      ${exercisesHTML}
    </div>
  ` : `
    <div class="section">
      <div class="section-title">Workout</div>
      <div class="empty-state">Rest day — no workout logged</div>
    </div>
  `

  const noNutrition = day.calories === 0 && day.meals.every(m => m.items.length === 0)

  const nutritionSection = noNutrition ? `
    <div class="section">
      <div class="section-title">Nutrition</div>
      <div class="empty-state">No food logged</div>
    </div>
  ` : `
    <div class="section">
      <div class="section-title">Nutrition</div>
      <div class="macro-grid">
        <div class="macro-card">
          <div class="macro-value c">${day.calories}</div>
          <div class="macro-unit">/ ${day.calorie_target} kcal</div>
          <div class="macro-label">Calories</div>
        </div>
        <div class="macro-card">
          <div class="macro-value p">${day.protein_g}</div>
          <div class="macro-unit">/ ${day.protein_target_g} g</div>
          <div class="macro-label">Protein</div>
        </div>
        <div class="macro-card">
          <div class="macro-value cb">${day.carbs_g}</div>
          <div class="macro-unit">/ ${day.carbs_target_g} g</div>
          <div class="macro-label">Carbs</div>
        </div>
        <div class="macro-card">
          <div class="macro-value f">${day.fat_g}</div>
          <div class="macro-unit">/ ${day.fat_target_g} g</div>
          <div class="macro-label">Fat</div>
        </div>
      </div>
      <div class="bar-row">
        <div class="bar-meta"><span>Calories</span><span>${caloriesPct}%</span></div>
        ${bar(day.calories, day.calorie_target, '#FF4D00')}
      </div>
      <div class="bar-row">
        <div class="bar-meta"><span>Protein</span><span>${proteinPct}%</span></div>
        ${bar(day.protein_g, day.protein_target_g, '#00D26A')}
      </div>
      <div class="bar-row">
        <div class="bar-meta"><span>Carbs</span><span>${carbsPct}%</span></div>
        ${bar(day.carbs_g, day.carbs_target_g, '#3B82F6')}
      </div>
      <div class="bar-row">
        <div class="bar-meta"><span>Fat</span><span>${fatPct}%</span></div>
        ${bar(day.fat_g, day.fat_target_g, '#F59E0B')}
      </div>
    </div>
    ${mealsHTML.trim() ? `<div class="section"><div class="section-title">Food Log</div>${mealsHTML}</div>` : ''}
  `

  const receiverRow = day.receiverName ? `
    <div class="receiver-row">
      <span class="receiver-label">Report for</span>
      <span class="receiver-name">${day.receiverName}</span>
    </div>
  ` : ''

  const footerLink = day.appLink ? `
    <div class="footer-download">
      <div class="footer-download-label">Try Surge free</div>
      <div class="footer-download-link">${day.appLink}</div>
    </div>
  ` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Surge Report — ${day.date}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1a1a1a; }
.page { background: #fff; max-width: 480px; margin: 0 auto; }
.header { background: #0D0D0D; padding: 24px 24px 20px; }
.header-top { display: flex; align-items: center; justify-content: space-between; }
.logo { display: flex; align-items: center; gap: 8px; }
.logo-emoji { font-size: 22px; }
.logo-text { font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 3px; }
.date-badge { background: rgba(255,77,0,0.15); border: 1px solid rgba(255,77,0,0.4); border-radius: 20px; padding: 4px 12px; font-size: 12px; color: #FF4D00; font-weight: 600; }
.athlete-row { margin-top: 16px; display: flex; align-items: center; gap: 10px; }
.athlete-avatar { width: 36px; height: 36px; border-radius: 18px; background: rgba(255,77,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; }
.athlete-name { font-size: 15px; font-weight: 700; color: #fff; }
.athlete-goal { font-size: 12px; color: #888; margin-top: 1px; }
.receiver-row { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.07); display: flex; align-items: center; gap: 8px; }
.receiver-label { font-size: 11px; color: #666; font-weight: 500; text-transform: uppercase; letter-spacing: 0.8px; }
.receiver-name { font-size: 13px; color: #FF4D00; font-weight: 700; }
.section { padding: 20px 24px; border-bottom: 1px solid #f0f0f0; }
.section:last-of-type { border-bottom: none; }
.section-title { font-size: 11px; font-weight: 700; color: #FF4D00; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 14px; }
.empty-state { font-size: 13px; color: #bbb; text-align: center; padding: 16px 0; }
.macro-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 14px; }
.macro-card { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 10px 6px; text-align: center; }
.macro-value { font-size: 18px; font-weight: 800; line-height: 1; }
.macro-unit { font-size: 10px; color: #aaa; margin-top: 2px; }
.macro-label { font-size: 10px; color: #888; margin-top: 3px; font-weight: 600; }
.c { color: #FF4D00; } .p { color: #00D26A; } .cb { color: #3B82F6; } .f { color: #F59E0B; }
.bar-row { margin-bottom: 10px; }
.bar-row:last-child { margin-bottom: 0; }
.bar-meta { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin-bottom: 5px; font-weight: 500; }
.bar-track { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; }
.meal { margin-bottom: 14px; }
.meal:last-child { margin-bottom: 0; }
.meal-slot { font-size: 11px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
.food-item { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid #f5f5f5; }
.food-item:last-child { border-bottom: none; }
.food-name { font-size: 13px; color: #222; font-weight: 500; }
.food-serving { font-size: 11px; color: #aaa; margin-top: 1px; }
.food-cals { font-size: 13px; font-weight: 700; color: #555; }
.exercise { margin-bottom: 14px; }
.exercise:last-child { margin-bottom: 0; }
.exercise-name { font-size: 13px; font-weight: 700; color: #222; margin-bottom: 6px; }
.sets-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.set-chip { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 4px 8px; font-size: 11px; color: #555; font-weight: 600; }
.pr-chip { background: rgba(255,77,0,0.08); border: 1px solid rgba(255,77,0,0.25); color: #FF4D00; font-size: 10px; font-weight: 700; border-radius: 6px; padding: 4px 8px; }
.footer { background: #fafafa; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #eee; }
.footer-brand { font-size: 11px; color: #bbb; font-weight: 600; letter-spacing: 1px; }
.footer-brand span { color: #FF4D00; }
.footer-note { font-size: 10px; color: #ccc; margin-top: 2px; }
.footer-download { text-align: right; }
.footer-download-label { font-size: 10px; color: #bbb; margin-bottom: 2px; }
.footer-download-link { font-size: 11px; color: #FF4D00; font-weight: 700; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div class="logo">
        <span class="logo-emoji">⚡</span>
        <span class="logo-text">SURGE</span>
      </div>
      <span class="date-badge">${day.date}</span>
    </div>
    <div class="athlete-row">
      <div class="athlete-avatar">⚡</div>
      <div>
        <div class="athlete-name">${day.athleteName}</div>
        <div class="athlete-goal">${day.athleteGoal} · ${day.weightKg} kg</div>
      </div>
    </div>
    ${receiverRow}
  </div>

  ${nutritionSection}
  ${workoutSection}

  <div class="footer">
    <div>
      <div class="footer-brand">⚡ <span>SURGE</span></div>
      <div class="footer-note">Generated ${generatedAt}</div>
    </div>
    ${footerLink}
  </div>
</div>
</body>
</html>`
}
