// SINEVERSE brand constants — single source of truth for colours, type and copy.
// Palette: Deep Navy, Soft White, Film Green, Light Grey, Mint.
export const BRAND = {
  colors: {
    navy: '#172438',
    softWhite: '#F5F7FA',
    filmGreen: '#16865E',
    lightGrey: '#E8EDF3',
    mint: '#A3E6C4',
  },
  name: 'SINEVERSE',
  tagline: 'Your World of Filmmaking',
  description:
    'Platform pendidikan filmmaking nasional untuk pelajar SMA/SMK di seluruh Indonesia.',
  gradebook: {
    quizWeight: 0.2,
    assignmentWeight: 0.5,
    examWeight: 0.3,
    passingGrade: 70,
  },
  rpsCode: 'SVS-SEM1',
} as const

export const GRADEBOOK_WEIGHTS = {
  kuis: 0.2,
  tugas: 0.5,
  ujian: 0.3,
} as const

export const PASSING_GRADE = 70
