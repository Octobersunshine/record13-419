class StatsPool {
  constructor() {
    this.provinceStats = new Map();
    this.ipVisits = new Map();
    this.totalVisits = 0;
    this.lastUpdated = null;

    this._pendingBuffer = [];
    this._isFlushing = false;
    this._flushScheduled = false;
    this._flushCallbacks = [];
  }

  recordVisit(ip, location) {
    return new Promise((resolve) => {
      this._pendingBuffer.push({ ip, location, timestamp: Date.now() });
      this._flushCallbacks.push(resolve);
      this._scheduleFlush();
    });
  }

  recordVisitSync(ip, location) {
    this._pendingBuffer.push({ ip, location, timestamp: Date.now() });
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._flushScheduled) return;
    this._flushScheduled = true;

    process.nextTick(() => {
      this._flush();
    });
  }

  _flush() {
    if (this._isFlushing) {
      this._flushScheduled = false;
      return;
    }

    if (this._pendingBuffer.length === 0) {
      this._flushScheduled = false;
      return;
    }

    this._isFlushing = true;

    const batch = this._pendingBuffer;
    const callbacks = this._flushCallbacks;
    this._pendingBuffer = [];
    this._flushCallbacks = [];
    this._flushScheduled = false;

    const provinceDeltas = new Map();
    const cityDeltas = new Map();
    const ipDeltas = new Map();
    let totalDelta = 0;
    let latestTimestamp = 0;

    for (const record of batch) {
      const { ip, location, timestamp } = record;
      const province = location.province || '未知';
      const city = location.city || '未知';

      if (!provinceDeltas.has(province)) {
        provinceDeltas.set(province, { count: 0, cities: new Map(), firstVisit: timestamp, lastVisit: timestamp });
      }
      const provinceDelta = provinceDeltas.get(province);
      provinceDelta.count++;
      if (timestamp < provinceDelta.firstVisit) provinceDelta.firstVisit = timestamp;
      if (timestamp > provinceDelta.lastVisit) provinceDelta.lastVisit = timestamp;

      if (!provinceDelta.cities.has(city)) {
        provinceDelta.cities.set(city, 0);
      }
      provinceDelta.cities.set(city, provinceDelta.cities.get(city) + 1);

      if (!ipDeltas.has(ip)) {
        ipDeltas.set(ip, { count: 0, province, city, firstVisit: timestamp, lastVisit: timestamp });
      }
      const ipDelta = ipDeltas.get(ip);
      ipDelta.count++;
      if (timestamp < ipDelta.firstVisit) ipDelta.firstVisit = timestamp;
      if (timestamp > ipDelta.lastVisit) ipDelta.lastVisit = timestamp;

      totalDelta++;
      if (timestamp > latestTimestamp) latestTimestamp = timestamp;
    }

    for (const [province, delta] of provinceDeltas) {
      if (!this.provinceStats.has(province)) {
        this.provinceStats.set(province, {
          count: 0,
          cities: new Map(),
          firstVisit: delta.firstVisit,
          lastVisit: delta.lastVisit,
        });
      }
      const stats = this.provinceStats.get(province);
      stats.count += delta.count;
      if (delta.firstVisit < stats.firstVisit) stats.firstVisit = delta.firstVisit;
      if (delta.lastVisit > stats.lastVisit) stats.lastVisit = delta.lastVisit;

      for (const [city, cityCount] of delta.cities) {
        if (!stats.cities.has(city)) {
          stats.cities.set(city, 0);
        }
        stats.cities.set(city, stats.cities.get(city) + cityCount);
      }
    }

    for (const [ip, delta] of ipDeltas) {
      if (!this.ipVisits.has(ip)) {
        this.ipVisits.set(ip, {
          count: 0,
          province: delta.province,
          city: delta.city,
          firstVisit: delta.firstVisit,
          lastVisit: delta.lastVisit,
        });
      }
      const stats = this.ipVisits.get(ip);
      stats.count += delta.count;
      if (delta.firstVisit < stats.firstVisit) stats.firstVisit = delta.firstVisit;
      if (delta.lastVisit > stats.lastVisit) stats.lastVisit = delta.lastVisit;
    }

    this.totalVisits += totalDelta;
    this.lastUpdated = latestTimestamp;

    this._isFlushing = false;

    for (const cb of callbacks) {
      cb();
    }

    if (this._pendingBuffer.length > 0) {
      this._scheduleFlush();
    }
  }

  flush() {
    return new Promise((resolve) => {
      if (this._pendingBuffer.length === 0 && !this._isFlushing) {
        resolve();
        return;
      }
      this._flushCallbacks.push(resolve);
      this._scheduleFlush();
    });
  }

  getProvinceStats() {
    const result = [];
    for (const [province, data] of this.provinceStats) {
      result.push({
        province,
        count: data.count,
        percentage: this.totalVisits > 0 ? ((data.count / this.totalVisits) * 100).toFixed(2) + '%' : '0%',
        cities: Object.fromEntries(data.cities),
        firstVisit: new Date(data.firstVisit).toLocaleString('zh-CN'),
        lastVisit: new Date(data.lastVisit).toLocaleString('zh-CN'),
      });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  getSummary() {
    return {
      totalVisits: this.totalVisits,
      uniqueIps: this.ipVisits.size,
      provinceCount: this.provinceStats.size,
      lastUpdated: this.lastUpdated ? new Date(this.lastUpdated).toLocaleString('zh-CN') : null,
    };
  }

  getTopProvinces(limit = 10) {
    return this.getProvinceStats().slice(0, limit);
  }

  getIpStats() {
    const result = [];
    for (const [ip, data] of this.ipVisits) {
      result.push({
        ip,
        count: data.count,
        province: data.province,
        city: data.city,
        firstVisit: new Date(data.firstVisit).toLocaleString('zh-CN'),
        lastVisit: new Date(data.lastVisit).toLocaleString('zh-CN'),
      });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  clear() {
    this.provinceStats.clear();
    this.ipVisits.clear();
    this.totalVisits = 0;
    this.lastUpdated = null;
    this._pendingBuffer = [];
    this._flushCallbacks = [];
  }

  getBufferSize() {
    return this._pendingBuffer.length;
  }
}

const statsPool = new StatsPool();

module.exports = statsPool;
