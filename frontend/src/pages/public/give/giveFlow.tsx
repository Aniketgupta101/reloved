import { createContext, useContext, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"
import type { UserFacingFeedback } from "@/lib/userFacingErrors"
import type { GiveForm, ItemDraft, PhotoItem } from "./model"

export type GiveFlow = {
  step: number
  setStep: Dispatch<SetStateAction<number>>
  steps: number[]
  STEP_LABELS: Record<number, string>
  loginResumeNote: string | null
  setLoginResumeNote: Dispatch<SetStateAction<string | null>>
  clearGiveDraft: () => void
  photoItems: PhotoItem[]
  setPhotoItems: Dispatch<SetStateAction<PhotoItem[]>>
  itemDrafts: Record<number, ItemDraft>
  setItemDrafts: Dispatch<SetStateAction<Record<number, ItemDraft>>>
  aiApplied: boolean
  setAiApplied: Dispatch<SetStateAction<boolean>>
  skippedAutofillRef: MutableRefObject<boolean>
  analyzeGenRef: MutableRefObject<number>
  analyzeInFlightRef: MutableRefObject<boolean>
  analyzing: boolean
  setAnalyzing: Dispatch<SetStateAction<boolean>>
  uploadMode: "single" | "bulk"
  setUploadMode: Dispatch<SetStateAction<"single" | "bulk">>
  activeGroupId: number
  setActiveGroupId: Dispatch<SetStateAction<number>>
  compressingPhotos: boolean
  uniqueGroupCount: number
  photoLimit: number
  itemSlots: number[]
  itemLabel: (groupId: number) => number
  countInGroup: (groupId: number) => number
  openCamera: () => void
  openGallery: () => void
  photoPickError: string | null
  startNewItemGroup: () => void
  assignPhotoToActiveItem: (index: number) => void
  removePhoto: (index: number) => void
  skipAutoFill: () => void
  analyzeError: string | null
  sensitivePhotoWarning: string | null
  bgKeptNote: string | null
  cameraInputRef: RefObject<HTMLInputElement | null>
  galleryInputRef: RefObject<HTMLInputElement | null>
  handlePhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>
  isMultiItem: boolean
  groupsMissingAiTitle: () => number[]
  retryAiForRemaining: () => void
  uniqueGroups: number[]
  detailGroup: number
  setDetailGroupId: Dispatch<SetStateAction<number>>
  draftIncompleteReasons: (d: ItemDraft) => string[]
  resolveGroupDraft: (gid: number) => ItemDraft
  selectDetailGroup: (gid: number) => void
  incompleteMultiGroups: () => { gid: number; label: number; reasons: string[] }[]
  multiIncompleteNote: string | null
  activeDraft: ItemDraft
  formData: GiveForm
  setFormData: Dispatch<SetStateAction<GiveForm>>
  patchActiveDraft: (patch: Partial<ItemDraft>) => void
  sizeRequiredForDraft: (category: string, gender: string) => boolean
  profileUsername: string | null
  hasSavedAddress: boolean
  editingAddress: boolean
  setEditingAddress: Dispatch<SetStateAction<boolean>>
  submitFeedback: UserFacingFeedback | null
  setSubmitFeedback: Dispatch<SetStateAction<UserFacingFeedback | null>>
  handleBack: () => void
  handleSubmit: () => void | Promise<void>
  isSubmitting: boolean
  handleNext: () => void | Promise<void>
  isStepValid: (s: number) => boolean
  loggedIn: boolean
}

const GiveFlowContext = createContext<GiveFlow | null>(null)

export function GiveFlowProvider({ value, children }: { value: GiveFlow; children: React.ReactNode }) {
  return <GiveFlowContext.Provider value={value}>{children}</GiveFlowContext.Provider>
}

export function useGiveFlow(): GiveFlow {
  const value = useContext(GiveFlowContext)
  if (!value) throw new Error("Give steps must render inside GiveFlowProvider")
  return value
}
