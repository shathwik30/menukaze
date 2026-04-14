'use client';

import { usePinExit } from '@/hooks/use-pin-exit';

/**
 * Invisible tap-zone (top-right corner) + PIN modal.
 * Mount this once in the kiosk layout so it is always present.
 */
export function PinOverlay() {
  const { showPin, pin, error, appendDigit, backspace, submitPin, dismiss } = usePinExit();

  return (
    <>
      {/* Invisible 64 x 64 tap zone. 5 taps opens PIN. */}
      <div
        id="kiosk-exit-trigger"
        className="fixed right-0 top-0 z-50 h-16 w-16 cursor-default"
        aria-hidden="true"
      />

      {showPin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6">
          <div className="w-80 rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-center text-xl font-bold text-zinc-950">Staff PIN</h2>

            <div className="mb-4 flex h-14 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-3xl tracking-[0.5em] text-zinc-950">
              {pin.replace(/./g, '●') || (
                <span className="text-base tracking-normal text-zinc-400">Enter PIN</span>
              )}
            </div>

            {error ? <p className="mb-3 text-center text-sm text-red-600">{error}</p> : null}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => appendDigit(d)}
                  className="h-14 rounded-lg bg-zinc-100 text-2xl font-semibold text-zinc-950 active:bg-zinc-200"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={dismiss}
                className="h-14 rounded-lg bg-zinc-100 text-sm font-medium text-zinc-600 active:bg-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => appendDigit('0')}
                className="h-14 rounded-lg bg-zinc-100 text-2xl font-semibold text-zinc-950 active:bg-zinc-200"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspace}
                className="h-14 rounded-lg bg-zinc-100 text-xl font-medium text-zinc-700 active:bg-zinc-200"
              >
                ⌫
              </button>
            </div>

            <button
              type="button"
              onClick={() => void submitPin()}
              disabled={pin.length === 0}
              className="mt-4 h-12 w-full rounded-lg bg-zinc-950 text-base font-semibold text-white active:bg-zinc-800 disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
