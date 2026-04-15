'use client';

import { useState, useTransition } from 'react';
import { submitFeedbackAction } from '@/app/actions/feedback';

interface Props {
  orderId: string;
  alreadySubmitted: boolean;
}

export function FeedbackWidget({ orderId, alreadySubmitted }: Props) {
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (submitted) {
    return (
      <p className="text-muted-foreground rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-900">
        Thanks for the feedback — the restaurant will see it on their dashboard.
      </p>
    );
  }

  const submit = (): void => {
    if (!rating) {
      setError('Pick a star rating first.');
      return;
    }
    setError(null);
    start(async () => {
      const result = await submitFeedbackAction({
        orderId,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  };

  return (
    <section className="border-border space-y-3 rounded-md border p-4">
      <h2 className="text-base font-semibold">How was your order?</h2>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((value) => {
          const active = (hover ?? rating ?? 0) >= value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHover(value)}
              className={`text-2xl ${active ? 'text-amber-500' : 'text-zinc-300'}`}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
            >
              ★
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Anything you'd like the restaurant to hear (optional)"
        className="border-border w-full rounded-md border px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send feedback'}
      </button>
    </section>
  );
}
