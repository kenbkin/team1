export type QuestionCategory =
  | 'birthplace'
  | 'filming-location'
  | 'other-location'

export type QuestionDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'

export type Question = {
  id: string
  celebrityId: string
  prompt: string
  answerLabel: string
  latitude: number
  longitude: number
  category: QuestionCategory
  difficulty: QuestionDifficulty
  sourceNote: string
}
