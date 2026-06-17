// 全局对话框状态管理（替代 Electron 中被禁用的 window.prompt/confirm）
import { create } from 'zustand'

type DialogType = 'confirm' | 'prompt' | null

interface DialogState {
  type: DialogType
  title: string
  message: string
  defaultValue?: string
  placeholder?: string
  confirmText: string
  cancelText: string
  danger?: boolean
  // 内部 resolve
  _resolve?: (value: any) => void
  inputValue: string

  open: (opts: Partial<Omit<DialogState, 'type' | '_resolve' | 'inputValue' | 'open' | 'close' | 'setInput'>> & { type: 'confirm' | 'prompt' }) => Promise<any>
  close: (result: any) => void
  setInput: (v: string) => void
}

export const useDialog = create<DialogState>((set, get) => ({
  type: null,
  title: '',
  message: '',
  defaultValue: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  _resolve: undefined,
  inputValue: '',

  open(opts) {
    return new Promise((resolve) => {
      set({
        type: opts.type,
        title: opts.title ?? '',
        message: opts.message ?? '',
        defaultValue: opts.defaultValue ?? '',
        placeholder: opts.placeholder ?? '',
        confirmText: opts.confirmText ?? '确定',
        cancelText: opts.cancelText ?? '取消',
        danger: opts.danger ?? false,
        inputValue: opts.defaultValue ?? '',
        _resolve: resolve,
      })
    })
  },

  close(result) {
    const resolve = get()._resolve
    if (resolve) resolve(result)
    set({ type: null, _resolve: undefined, inputValue: '' })
  },

  setInput(v) {
    set({ inputValue: v })
  },
}))

// 便捷方法，签名与原生 window.confirm/prompt 类似
export function confirmDialog(message: string, opts?: { title?: string; confirmText?: string; danger?: boolean }): Promise<boolean> {
  return useDialog.getState().open({
    type: 'confirm',
    message,
    title: opts?.title ?? '确认操作',
    confirmText: opts?.confirmText ?? '确定',
    danger: opts?.danger,
  }).then((v) => !!v)
}

export function promptDialog(message: string, opts?: { title?: string; defaultValue?: string; placeholder?: string; confirmText?: string }): Promise<string | null> {
  return useDialog.getState().open({
    type: 'prompt',
    message,
    title: opts?.title ?? '请输入',
    defaultValue: opts?.defaultValue,
    placeholder: opts?.placeholder,
    confirmText: opts?.confirmText ?? '确定',
  }).then((v) => (v === undefined ? null : v))
}
