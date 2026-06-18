class StatsPool {
  constructor() {
    this.provinceStats = new Map();
    this.ipVisits = new Map();
    this.totalVisits = 0;
    this.lastUpdated = null;
  }

  recordVisit(ip, location) {
    const province = location.province || '未知';
    const city = location.city || '未知';
    const now = Date.now();

    if (!this.provinceStats.has(province)) {
      this.provinceStats.set(province, {
        count: 0,
        cities: new Map(),
        firstVisit: now,
        lastVisit: now,
      });
    }

    const provinceData = this.provinceStats.get(province);
    provinceData.count++;
    provinceData.lastVisit = now;

    if (!provinceData.cities.has(city)) {
      provinceData.cities.set(city, 0);
    }
    provinceData.cities.set(city, provinceData.cities.get(city) + 1);

    if (!this.ipVisits.has(ip)) {
      this.ipVisits.set(ip, {
        count: 0,
        province,
        city,
        firstVisit: now,
        lastVisit: now,
      });
    }
    const ipData = this.ipVisits.get(ip);
    ipData.count++;
    ipData.lastVisit = now;

    this.totalVisits++;
    this.lastUpdated = now;
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
  }
}

const statsPool = new StatsPool();

module.exports = statsPool;
