'use client';

import { useEffect, useState } from 'react';
import * as Ably from 'ably';
import { isOrderStatusChangedEvent, type OrderStatus } from '@menukaze/realtime';
import { OrderTracker } from './order-tracker';
import { FeedbackWidget } from './feedback-widget';

interface Props {
  restaurantId: string;
  orderId: string;
  channelName: string;
  initialStatus: OrderStatus;
  initialPaymentStatus: string;
  alreadySubmittedFeedback: boolean;
}

const FEEDBACK_STATUSES: OrderStatus[] = ['ready', 'served', 'completed'];

// One Ably subscription owns the live status for this order. OrderTracker
// renders the progress UI from it, and the FeedbackWidget fades in once the
// status hits ready — without a page refresh.
export function TrackingArea({
  restaurantId,
  orderId,
  channelName,
  initialStatus,
  initialPaymentStatus,
  alreadySubmittedFeedback,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);

  useEffect(() => {
    const tokenUrl = `/api/ably/token?orderId=${encodeURIComponent(orderId)}`;
    const client = new Ably.Realtime({ authUrl: tokenUrl });
    const channel = client.channels.get(channelName);
    const handler = (message: Ably.Message) => {
      if (message.name !== 'order.status_changed') return;
      if (!isOrderStatusChangedEvent(message.data)) return;
      if (message.data.orderId === orderId) setStatus(message.data.status);
    };
    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [orderId, channelName]);

  const showFeedback = FEEDBACK_STATUSES.includes(status);

  return (
    <>
      <OrderTracker
        restaurantId={restaurantId}
        orderId={orderId}
        channelName={channelName}
        initialStatus={status}
        initialPaymentStatus={initialPaymentStatus}
      />
      {showFeedback ? (
        <div className="mt-6">
          <FeedbackWidget orderId={orderId} alreadySubmitted={alreadySubmittedFeedback} />
        </div>
      ) : null}
    </>
  );
}
