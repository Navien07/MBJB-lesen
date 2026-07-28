export interface FormState {
  error: string | null
  fieldErrors: Record<string, string>
}

export const EMPTY_FORM_STATE: FormState = { error: null, fieldErrors: {} }
