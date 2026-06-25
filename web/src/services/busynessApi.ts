// 繁忙度指标 API 服务
// 拉取后端订阅者统计，并按节点（OwnerType+OwnerID）聚合

const API_BASE = '/api';

// 后端单订阅者统计快照（对应 internal/queue.Stats）
export interface SubscriberStats {
  id: string;
  name: string;
  owner_type: 'listener' | 'chain' | 'dispatcher' | 'viewer' | 'legacy';
  owner_id: number;
  topics: string[];
  depth: number;
  cap: number;
  enqueued_total: number;
  dequeued_total: number;
  dropped_total: number;
  last_drop_at: number; // unix nano，0=从未丢
  in_rate: number; // 条/秒
  out_rate: number; // 条/秒
  busyness: number; // 0~100
}

// 前端聚合后的节点级徽章数据
export interface BusynessBadgeData {
  ownerType: string;
  ownerId: number;
  depth: number;
  cap: number;
  enqueuedTotal: number;
  dequeuedTotal: number;
  droppedTotal: number;
  lastDropAt: number;
  inRate: number;
  outRate: number;
  busyness: number;
  subCount: number;
}

// 拉取所有订阅者原始统计
export const fetchSubscribers = async (): Promise<SubscriberStats[]> => {
  const res = await fetch(`${API_BASE}/metrics/subscribers`);
  const data = await res.json();
  return data.data || [];
};

// 按 OwnerType+OwnerID 聚合多个订阅者的统计
// 取最大深度/最大繁忙度/最大丢包时间作为节点级展示
export const aggregateBusyness = (stats: SubscriberStats[]): BusynessBadgeData[] => {
  const groups = new Map<string, SubscriberStats[]>();
  for (const s of stats) {
    const key = `${s.owner_type}#${s.owner_id}`;
    const g = groups.get(key);
    if (g) {
      g.push(s);
    } else {
      groups.set(key, [s]);
    }
  }

  const out: BusynessBadgeData[] = [];
  groups.forEach((list) => {
    const first = list[0];
    const agg: BusynessBadgeData = {
      ownerType: first.owner_type,
      ownerId: first.owner_id,
      depth: 0,
      cap: 0,
      enqueuedTotal: 0,
      dequeuedTotal: 0,
      droppedTotal: 0,
      lastDropAt: 0,
      inRate: 0,
      outRate: 0,
      busyness: 0,
      subCount: list.length,
    };
    for (const s of list) {
      agg.depth += s.depth;
      agg.cap += s.cap;
      agg.enqueuedTotal += s.enqueued_total;
      agg.dequeuedTotal += s.dequeued_total;
      agg.droppedTotal += s.dropped_total;
      if (s.last_drop_at > agg.lastDropAt) {
        agg.lastDropAt = s.last_drop_at;
      }
      agg.inRate += s.in_rate;
      agg.outRate += s.out_rate;
      if (s.busyness > agg.busyness) {
        agg.busyness = s.busyness;
      }
    }
    // cap 已聚合为多订阅者总深度，busyness 取最大，确保徽章取最坏节点状态
    out.push(agg);
  });
  return out;
};

// 一次性获取聚合后的徽章数据（便于上层直接使用）
export const fetchBusynessBadges = async (): Promise<BusynessBadgeData[]> => {
  const subs = await fetchSubscribers();
  return aggregateBusyness(subs);
};
