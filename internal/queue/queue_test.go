package queue

import (
	"sync"
	"testing"
	"time"

	"github.com/injoyai/script-gateway/internal/types"
)

func TestSubscribeNamed_PublishConsume(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	sub, ch := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "listener", OwnerID: 1, Buffer: 10,
	})

	q.Publish(types.NewMessage([]byte("a"), "t1"))

	select {
	case msg := <-ch:
		if string(msg.Payload) != "a" {
			t.Fatalf("payload = %s, want a", msg.Payload)
		}
		sub.RecordDequeue()
	case <-time.After(time.Second):
		t.Fatal("recv timeout")
	}

	st := sub.Stats()
	if st.EnqueuedTotal != 1 {
		t.Errorf("enqueued = %d, want 1", st.EnqueuedTotal)
	}
	if st.DequeuedTotal != 1 {
		t.Errorf("dequeued = %d, want 1", st.DequeuedTotal)
	}
}

func TestPublish_DroppedCounter(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	sub, _ := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "viewer", OwnerID: 1, Buffer: 1,
	})

	// 投递 5 条，只消费 1 条，其余 4 条命中 buffer=1 的 default
	q.Publish(types.NewMessage([]byte("1"), "t1"))
	q.Publish(types.NewMessage([]byte("2"), "t1"))
	q.Publish(types.NewMessage([]byte("3"), "t1"))
	q.Publish(types.NewMessage([]byte("4"), "t1"))
	q.Publish(types.NewMessage([]byte("5"), "t1"))

	st := sub.Stats()
	if st.EnqueuedTotal != 1 {
		t.Errorf("enqueued = %d, want 1", st.EnqueuedTotal)
	}
	if st.DroppedTotal != 4 {
		t.Errorf("dropped = %d, want 4", st.DroppedTotal)
	}
	if st.LastDropAt == 0 {
		t.Error("lastDropAt should be set")
	}
}

func TestUnsubscribeSub_StopsDelivery(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	sub, _ := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "listener", OwnerID: 1, Buffer: 10,
	})
	q.UnsubscribeSub(sub)

	q.Publish(types.NewMessage([]byte("a"), "t1"))

	st := sub.Stats()
	if st.EnqueuedTotal != 0 {
		t.Errorf("after unsubscribe enqueued = %d, want 0", st.EnqueuedTotal)
	}
}

func TestPublish_ConcurrentNoRace(t *testing.T) {
	q := New(1000)
	defer close(q.stopTick)

	sub, _ := q.SubscribeNamed([]string{"t1"}, SubOpts{
		Name: "test", OwnerType: "chain", OwnerID: 1, Buffer: 1000,
	})

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				q.Publish(types.NewMessage([]byte("x"), "t1"))
			}
		}()
	}
	wg.Wait()

	st := sub.Stats()
	if st.EnqueuedTotal+st.DroppedTotal != 10000 {
		t.Errorf("enqueued+dropped = %d, want 10000", st.EnqueuedTotal+st.DroppedTotal)
	}
}

func TestSubscribers_ReturnsAll(t *testing.T) {
	q := New(100)
	defer close(q.stopTick)

	q.SubscribeNamed([]string{"t1"}, SubOpts{Name: "a", OwnerType: "listener", OwnerID: 1, Buffer: 10})
	q.SubscribeNamed([]string{"t2"}, SubOpts{Name: "b", OwnerType: "viewer", OwnerID: 1, Buffer: 10})

	subs := q.Subscribers()
	if len(subs) != 2 {
		t.Fatalf("subs len = %d, want 2", len(subs))
	}
}
