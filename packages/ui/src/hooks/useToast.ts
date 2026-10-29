'use client';

export type ToastVariant = 'info' | 'done' | 'attention' | 'danger';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

let _dispatch: ((opts: ToastOptions) => void) | null = null;

export function _registerToastDispatch(fn: (opts: ToastOptions) => void): () => void {
  _dispatch = fn;
  return () => {
    _dispatch = null;
  };
}

export function useToast() {
  return {
    toast(opts: ToastOptions) {
      if (_dispatch) _dispatch(opts);
    },
  };
}
