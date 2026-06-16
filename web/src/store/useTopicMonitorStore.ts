import { create } from 'zustand';

interface TopicMonitorState {
  open: boolean;
  topic: string | null;
  openTopic: (topic: string) => void;
  close: () => void;
}

const useTopicMonitorStore = create<TopicMonitorState>((set) => ({
  open: false,
  topic: null,
  openTopic: (topic: string) => set({ open: true, topic }),
  close: () => set({ open: false }),
}));

export default useTopicMonitorStore;
