'use client';

import { Button, Card, FieldError } from '@menukaze/ui';
import { usePinExit } from '@/hooks/use-pin-exit';

// Mount once in the kiosk layout to keep the exit gesture always available.
export function PinOverlay() {
  const { showPin, pin, error, appendDigit, backspace, submitPin, dismiss } = usePinExit();

  return (
    <>
      <div
        id="kiosk-exit-trigger"
        className="fixed top-0 right-0 z-50 h-16 w-16 cursor-default"
        aria-hidden="true"
      />

      {showPin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6">
          <Card className="w-80 bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-center text-xl font-bold text-zinc-950">Staff PIN</h2>

            <div className="mb-4 flex h-14 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-3xl tracking-[0.5em] text-zinc-950">
              {pin.replace(/./g, '●') || (
                <span className="text-base tracking-normal text-zinc-400">Enter PIN</span>
              )}
            </div>

            {error ? <FieldError className="mb-3 justify-center">{error}</FieldError> : null}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <Button
                  key={d}
                  type="button"
                  onClick={() => appendDigit(d)}
                  variant="secondary"
                  size="xl"
                  className="h-14 text-2xl font-semibold text-zinc-950 active:bg-zinc-200"
                >
                  {d}
                </Button>
              ))}
              <Button
                type="button"
                onClick={dismiss}
                variant="secondary"
                size="xl"
                className="h-14 text-sm font-medium text-zinc-600 active:bg-zinc-200"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => appendDigit('0')}
                variant="secondary"
                size="xl"
                className="h-14 text-2xl font-semibold text-zinc-950 active:bg-zinc-200"
              >
                0
              </Button>
              <Button
                type="button"
                onClick={backspace}
                variant="secondary"
                size="xl"
                className="h-14 text-xl font-medium text-zinc-700 active:bg-zinc-200"
              >
                ⌫
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => void submitPin()}
              disabled={pin.length === 0}
              full
              size="lg"
              className="mt-4 active:bg-zinc-800 disabled:opacity-40"
            >
              Confirm
            </Button>
          </Card>
        </div>
      ) : null}
    </>
  );
}
