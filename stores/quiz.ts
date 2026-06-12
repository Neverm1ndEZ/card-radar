import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SpendProfile, RecommendRequest } from '@/lib/validators'

const DEFAULT_SPENDS: SpendProfile = {
  grocery: 0, dining: 0, fuel: 0, travel: 0, movies: 0, shopping: 0,
  utilities: 0, international: 0, rent: 0, amazon: 0, flipkart: 0, upi: 0,
  blinkit: 0, zepto: 0, instamart: 0, bigbasket: 0, dmart: 0,
  myntra: 0, nykaa: 0, ajio: 0, zomato: 0, swiggy: 0,
  education: 0, insurance: 0, subscriptions: 0, apparel: 0,
}

interface QuizState {
  step: number
  monthly_spends: SpendProfile
  annual_income: number | undefined
  credit_score_band: RecommendRequest['credit_score_band']
  reward_preference: RecommendRequest['reward_preference']
  existing_card_slugs: string[]
  exclude_invite_only: boolean

  setStep: (step: number) => void
  setMonthlySpends: (spends: Partial<SpendProfile>) => void
  setAnnualIncome: (income: number | undefined) => void
  setCreditScoreBand: (band: RecommendRequest['credit_score_band']) => void
  setRewardPreference: (pref: RecommendRequest['reward_preference']) => void
  setExistingCards: (slugs: string[]) => void
  setExcludeInviteOnly: (val: boolean) => void
  reset: () => void
  toRequest: () => RecommendRequest
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      step: 0,
      monthly_spends: { ...DEFAULT_SPENDS },
      annual_income: undefined,
      credit_score_band: undefined,
      reward_preference: undefined,
      existing_card_slugs: [],
      exclude_invite_only: false,

      setStep: (step) => set({ step }),
      setMonthlySpends: (spends) =>
        set((s) => ({ monthly_spends: { ...s.monthly_spends, ...spends } })),
      setAnnualIncome: (income) => set({ annual_income: income }),
      setCreditScoreBand: (band) => set({ credit_score_band: band }),
      setRewardPreference: (pref) => set({ reward_preference: pref }),
      setExistingCards: (slugs) => set({ existing_card_slugs: slugs }),
      setExcludeInviteOnly: (val) => set({ exclude_invite_only: val }),
      reset: () =>
        set({
          step: 0,
          monthly_spends: { ...DEFAULT_SPENDS },
          annual_income: undefined,
          credit_score_band: undefined,
          reward_preference: undefined,
          existing_card_slugs: [],
          exclude_invite_only: false,
        }),
      toRequest: (): RecommendRequest => {
        const s = get()
        return {
          monthly_spends: s.monthly_spends,
          annual_income: s.annual_income,
          credit_score_band: s.credit_score_band,
          reward_preference: s.reward_preference,
          existing_card_slugs: s.existing_card_slugs,
          exclude_invite_only: s.exclude_invite_only,
        }
      },
    }),
    {
      name: 'cardradar-quiz',
      skipHydration: true,
    }
  )
)
