class StatsPool {
  constructor() {
    this.provinceStats = new Map();
    this.ipVisits = new Map();
    this.totalVisits = 0;
    this.lastUpdated = null;

    this.hourlyStats = new Map();

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

  recordVisitWithTime(ip, location, timestamp) {
    this._pendingBuffer.push({ ip, location, timestamp });
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
    const ipDeltas = new Map();
    const hourlyDeltas = new Map();
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

      const date = new Date(timestamp);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const hour = date.getHours();

      if (!hourlyDeltas.has(dateKey)) {
        hourlyDeltas.set(dateKey, new Map());
      }
      const dateData = hourlyDeltas.get(dateKey);
      if (!dateData.has(province)) {
        dateData.set(province, new Array(24).fill(0));
      }
      dateData.get(province)[hour]++;

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

    for (const [dateKey, provinceData] of hourlyDeltas) {
      if (!this.hourlyStats.has(dateKey)) {
        this.hourlyStats.set(dateKey, new Map());
      }
      const targetDateData = this.hourlyStats.get(dateKey);

      for (const [province, hourCounts] of provinceData) {
        if (!targetDateData.has(province)) {
          targetDateData.set(province, new Array(24).fill(0));
        }
        const targetHourCounts = targetDateData.get(province);
        for (let h = 0; h < 24; h++) {
          targetHourCounts[h] += hourCounts[h];
        }
      }
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

  getHourlyStats(dateKey = null, province = null) {
    const result = [];

    const dates = dateKey ? [dateKey] : Array.from(this.hourlyStats.keys()).sort();

    for (const d of dates) {
      const dateData = this.hourlyStats.get(d);
      if (!dateData) continue;

      const provinces = province ? [province] : Array.from(dateData.keys());

      for (const p of provinces) {
        const hourCounts = dateData.get(p);
        if (!hourCounts) continue;

        result.push({
          date: d,
          province: p,
          hourly: hourCounts.map((count, hour) => ({
            hour,
            hourLabel: `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`,
            count,
          })),
          total: hourCounts.reduce((sum, c) => sum + c, 0),
        });
      }
    }

    return result.sort((a, b) => b.total - a.total);
  }

  getPeakHours(dateKey = null, topN = 3) {
    const result = [];
    const provincePeakMap = new Map();

    const dates = dateKey ? [dateKey] : Array.from(this.hourlyStats.keys()).sort();

    for (const d of dates) {
      const dateData = this.hourlyStats.get(d);
      if (!dateData) continue;

      for (const [province, hourCounts] of dateData) {
        if (!provincePeakMap.has(province)) {
          provincePeakMap.set(province, new Array(24).fill(0));
        }
        const aggCounts = provincePeakMap.get(province);
        for (let h = 0; h < 24; h++) {
          aggCounts[h] += hourCounts[h];
        }
      }
    }

    const TIME_PERIODS = [
      { name: '凌晨', hours: [0, 1, 2, 3, 4, 5] },
      { name: '上午', hours: [6, 7, 8, 9, 10, 11] },
      { name: '中午', hours: [12, 13] },
      { name: '下午', hours: [14, 15, 16, 17] },
      { name: '傍晚', hours: [18, 19] },
      { name: '晚间', hours: [20, 21, 22, 23] },
    ];

    for (const [province, aggCounts] of provincePeakMap) {
      const total = aggCounts.reduce((sum, c) => sum + c, 0);
      if (total === 0) continue;

      const hoursWithCount = aggCounts.map((count, hour) => ({
        hour,
        hourLabel: `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(2) + '%' : '0%',
      }));

      const sortedHours = [...hoursWithCount].sort((a, b) => b.count - a.count);
      const topHours = sortedHours.slice(0, topN);

      const periodCounts = TIME_PERIODS.map(period => {
        const count = period.hours.reduce((sum, h) => sum + aggCounts[h], 0);
        return {
          period: period.name,
          hours: period.hours,
          count,
          percentage: total > 0 ? ((count / total) * 100).toFixed(2) + '%' : '0%',
        };
      }).sort((a, b) => b.count - a.count);

      const avgPerHour = total / 24;
      const peakHours = sortedHours.filter(h => h.count > avgPerHour * 1.5).map(h => h.hour);

      result.push({
        province,
        total,
        avgPerHour: avgPerHour.toFixed(1),
        peakHours: topHours,
        peakPeriods: periodCounts,
        concentratedHours: peakHours.sort((a, b) => a - b),
        suggestion: this._generateSuggestion(province, topHours, periodCounts, peakHours),
      });
    }

    return result.sort((a, b) => b.total - a.total);
  }

  _generateSuggestion(province, topHours, peakPeriods, concentratedHours) {
    const suggestions = [];
    const topPeriod = peakPeriods[0];
    const topHour = topHours[0];

    if (topPeriod) {
      suggestions.push(`${province}访客最高峰在${topPeriod.period}时段，占比${topPeriod.percentage}，建议在此时段重点投放运营活动`);
    }

    if (topHour && topHour.count > 0) {
      suggestions.push(`最高频小时为${topHour.hourLabel}，访客数${topHour.count}，占比${topHour.percentage}`);
    }

    if (concentratedHours.length > 0) {
      const hourStr = concentratedHours.map(h => `${String(h).padStart(2, '0')}点`).join('、');
      suggestions.push(`高活跃时段集中在：${hourStr}`);
    }

    const lowPeriods = peakPeriods.filter(p => p.percentage < '10.00%');
    if (lowPeriods.length > 0) {
      const lowStr = lowPeriods.map(p => p.period).join('、');
      suggestions.push(`${lowStr}时段访客较少，可考虑安排系统维护或非紧急运营任务`);
    }

    if (peakPeriods[0] && peakPeriods[0].period === '晚间') {
      suggestions.push('该省份用户晚间活跃度高，适合推送促销活动、直播等内容');
    } else if (peakPeriods[0] && peakPeriods[0].period === '上午') {
      suggestions.push('该省份用户上午活跃度高，适合推送早间资讯、限时优惠等内容');
    }

    return suggestions;
  }

  getPeakAnalysis(dateKey = null) {
    const peakData = this.getPeakHours(dateKey);

    const globalHourly = new Array(24).fill(0);

    const dates = dateKey ? [dateKey] : Array.from(this.hourlyStats.keys()).sort();

    for (const d of dates) {
      const dateData = this.hourlyStats.get(d);
      if (!dateData) continue;

      for (const provinceData of peakData) {
        const provinceHourly = dateData.get(provinceData.province);
        if (provinceHourly) {
          for (let h = 0; h < 24; h++) {
            globalHourly[h] += provinceHourly[h];
          }
        }
      }
    }

    const TIME_PERIODS = [
      { name: '凌晨', hours: [0, 1, 2, 3, 4, 5] },
      { name: '上午', hours: [6, 7, 8, 9, 10, 11] },
      { name: '中午', hours: [12, 13] },
      { name: '下午', hours: [14, 15, 16, 17] },
      { name: '傍晚', hours: [18, 19] },
      { name: '晚间', hours: [20, 21, 22, 23] },
    ];

    const globalTotal = globalHourly.reduce((sum, c) => sum + c, 0);
    const globalPeriodStats = TIME_PERIODS.map(period => {
      const count = period.hours.reduce((sum, h) => sum + globalHourly[h], 0);
      return {
        period: period.name,
        count,
        percentage: globalTotal > 0 ? ((count / globalTotal) * 100).toFixed(2) + '%' : '0%',
      };
    }).sort((a, b) => b.count - a.count);

    const peakHoursIndices = globalHourly
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(h => ({
        hour: h.hour,
        hourLabel: `${String(h.hour).padStart(2, '0')}:00-${String(h.hour + 1).padStart(2, '0')}:00`,
        count: h.count,
        percentage: globalTotal > 0 ? ((h.count / globalTotal) * 100).toFixed(2) + '%' : '0%',
      }));

    return {
      global: {
        totalVisits: globalTotal,
        peakHours: peakHoursIndices,
        peakPeriods: globalPeriodStats,
        hourlyDistribution: globalHourly.map((count, hour) => ({
          hour,
          hourLabel: `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`,
          count,
          percentage: globalTotal > 0 ? ((count / globalTotal) * 100).toFixed(2) + '%' : '0%',
        })),
      },
      byProvince: peakData,
      dateRange: dateKey ? [dateKey] : Array.from(this.hourlyStats.keys()).sort(),
      analysisTime: new Date().toLocaleString('zh-CN'),
    };
  }

  clear() {
    this.provinceStats.clear();
    this.ipVisits.clear();
    this.hourlyStats.clear();
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
