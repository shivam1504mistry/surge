// TDEE and macro calculation constants
// Used by onboarding agent to compute calorie + macro targets

export type Goal = 'fat_loss' | 'muscle_gain' | 'recomp' | 'maintain' | 'performance'
export type Sex  = 'male' | 'female' | 'other'

// Activity multiplier — defaulted to moderate (gym 3-5x/week)
const ACTIVITY_MULTIPLIER = 1.55

// Calorie adjustment by goal (delta from TDEE)
const GOAL_DELTA: Record<Goal, number> = {
  fat_loss:    -400,
  muscle_gain: +250,
  recomp:       0,
  maintain:     0,
  performance: +150,
}

export function calculateTargets(params: {
  weight_kg: number
  height_cm: number
  age: number
  sex: Sex
  goal: Goal
}): { calories: number; protein_g: number; carbs_g: number; fat_g: number } {
  const { weight_kg, height_cm, age, sex, goal } = params

  // Mifflin-St Jeor BMR
  const bmr =
    sex === 'male'
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

  const tdee     = Math.round(bmr * ACTIVITY_MULTIPLIER)
  const calories = Math.round(tdee + GOAL_DELTA[goal])

  // Macro split: 2g protein per kg, 25% fat, remainder carbs
  const protein_g = Math.round(weight_kg * 2.0)
  const fat_g     = Math.round((calories * 0.25) / 9)
  const carbs_g   = Math.round((calories - protein_g * 4 - fat_g * 9) / 4)

  return { calories, protein_g, carbs_g, fat_g }
}
