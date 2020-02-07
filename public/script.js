const LOW = 4;
const HIGH = 10;
Chart.plugins.register({
  beforeRender: function(chart) {
    if (chart.config.options.showAllTooltips) {
      // create an array of tooltips
      // we can't use the chart tooltip because there is only one tooltip per chart
      chart.pluginTooltips = [];
      chart.config.data.datasets.forEach((dataset, i) => {
        chart.getDatasetMeta(i).data.forEach((sector, j) => {
          const point = dataset.data[j];
          if (point.carbs || point.insulin) {
            chart.pluginTooltips.push(new Chart.Tooltip({
              _chart: chart.chart,
              _chartInstance: chart,
              _data: chart.data,
              _options: chart.options.tooltips,
              _active: [sector]
            }, chart));
          }
        });
      });

      // turn off normal tooltips
      chart.options.tooltips.enabled = false;
    }
  },
  afterDraw: function(chart, easing) {
    if (chart.config.options.showAllTooltips) {
      // we don't want the permanent tooltips to animate, so don't do anything till the animation runs atleast once
      if (!chart.allTooltipsOnce) {
        if (easing !== 1)
          return;
        chart.allTooltipsOnce = true;
      }

      // turn on tooltips
      chart.options.tooltips.enabled = true;
      Chart.helpers.each(chart.pluginTooltips, function(tooltip) {
        tooltip.initialize();
        tooltip.update();
        // we don't actually need this since we are not animating tooltips
        tooltip.pivot();
        tooltip.transition(easing).draw();
      });
      chart.options.tooltips.enabled = false;
    }
  }
});
const socket = io();
window.onload = () => {
  socket.emit('api', { path: 'path' }, ({ bg, treatments }) => {
    dailyDistribution(bg, treatments);
    weeklySummary({ bg, ...treatments });
    inRangePie(bg);
  });
}

function inRangePie(in_data) {
  const ctx = document.getElementById('bgPie').getContext('2d');
  const data = [0, 0, 0];
  in_data.forEach(({ bg }) => {
    if (bg < LOW) {
      data[0]++;
    } else if (bg > HIGH) {
      data[2]++;
    } else {
      data[1]++;
    }
  });
  const myPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      datasets: [{
        data,
        backgroundColor: ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(255,127,80)']
      }],
      labels: ['Low', 'In Range', 'High']
    },
    options: {
      responsive: false,
      tooltips: {
        callbacks: {
          title: function() {
            return "";
          },
          label: function({ index }) {
            return `${Math.round(data[index]/in_data.length*100)}%`
          }
        }
      }
    }
  });
}

function dailyDistribution(bg, { carbs, insulin }) {
  dailyDistributionBG(bg);
  dailyDistributionCarbs(carbs);
  dailyDistributionInsulin(insulin);
}



function dailyDistributionBG(in_data) {
  const ctx = document.getElementById('bgChart').getContext('2d');

  const data = distribution(in_data, 'bg');

  const datasets = [getMedianDataset(data), ...getPercentileDatasets(data)];
  const chart = new Chart(ctx, {
    label: 'Daily distribution',
    type: 'line',
    data: {
      datasets
    },
    options: {
      responsive: false,
      scales: {
        xAxes: [{
          type: 'time',
          time: {
            unit: 'hour'
          },
          bounds: 'ticks'
        }],
        yAxes: [{
          ticks: {
            suggestedMin: 0,
            suggestedMax: 12
          }
        }]
      },
      annotation: {
        annotations: [{
          type: 'line',
          mode: 'horizontal',
          scaleID: 'y-axis-0',
          value: LOW,
          borderColor: 'rgb(255, 0, 0)',
          borderWidth: 1,
          label: {
            enabled: false,
            content: 'Test label'
          }
        }, {
          type: 'line',
          mode: 'horizontal',
          scaleID: 'y-axis-0',
          value: HIGH,
          borderColor: 'rgb(255, 0, 0)',
          borderWidth: 1,
          label: {
            enabled: false,
            content: 'Test label'
          }
        }]
      }
    }
  })
}

function dailyDistributionCarbs(in_data) {
  const ctx = document.getElementById('carbsChart').getContext('2d');

  const data = Object.values(distribution(in_data, 'carbs')).flat().sort(sortProp.bind(null, 'timestamp')).map(pointifyKeepAll.bind(null, {x: 'timestamp', y: 'carbs'}));

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Carbs',
        data,
        showLine: false,
        pointRadius: 4,
        borderColor: 'rgb(255,165,0)',
        backgroundColor: 'rgb(255,165,0)'
      }]
    },
    options: {
      responsive: false,
      scales: {
        xAxes: [{
          type: 'time',
          time: {
            unit: 'hour'
          },
          bounds: 'ticks'
        }],
        yAxes: [{
          ticks: {
            suggestedMin: 0
          }
        }]
      },
      showAllTooltips: true,
      tooltips: {
        callbacks: {
          title: function([{ datasetIndex, index }], { datasets }) {
            const g = datasets[0].data[index].carbs;
            return g ? `${parseInt(g*100)/100}g` : '';
          },
          label: function() { return '' }
        }
      }
    }
  })
}

function dailyDistributionInsulin(in_data) {
  const ctx = document.getElementById('insulinChart').getContext('2d');

  const data = Object.values(distributionAVG(in_data, 'insulin')).flat().sort(sortProp.bind(null, 'timestamp')).map(pointify);

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [{
        label: 'Insulin',
        data: data.slice(0, 20),
        showLine: false
      }]
    },
    options: {
      responsive: false,
      scales: {
        xAxes: [{
          type: 'time',
          time: {
            unit: 'hour'
          },
          bounds: 'ticks',
          offset: true
        }],
        yAxes: [{
          ticks: {
            suggestedMin: 0
          }
        }]
      }
    }
  })
}

function weeklySummary(in_data) {
  const data = Object.values(splitByDay(in_data));
  const div = document.getElementById('weeklySummary');
  for (let i = 0; i < data.length; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 1500;
    canvas.height = 200;
    div.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const datasets = [];

    data[i].bg = removeDuplicates('timestamp', data[i].bg);
    for (let point of data[i].bg) {
      if (data[i].carbs) {
        const cutoff = 300000;
        let props = data[i].carbs.filter(({ timestamp }) => {
          const diff = timestamp - point.timestamp;
          return diff > 0 && diff < cutoff
        });
        if (props.length) {
          props = removeDuplicates('timestamp', props);
          point.carbs = props.reduce((a, { carbs }) => a + carbs, 0)
        }
        props = data[i].insulin.filter(({ timestamp }) => {
          const diff = timestamp - point.timestamp;
          return diff > 0 && diff < cutoff
        });
        if (props.length) {
          props = removeDuplicates('timestamp', props);
          point.insulin = props.reduce((a, { insulin }) => a + insulin, 0)
        }

      }
    }

    if (data[i].bg) {
      const bgData = data[i].bg.map(pointifyKeep.bind(null, { x: 'timestamp', y: 'bg' }));
      datasets.push({
        label: data[i].label,
        data: bgData,
        pointRadius: bgData.map(point => (+!!(point.carbs || point.insulin)) * 6),
        fill: false,
        borderColor: 'rgb(0, 0, 255)',
      })
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: false,
        scales: {
          xAxes: [{
            type: 'time',
            time: {
              unit: 'hour'
            },
            bounds: 'ticks'
          }],
          yAxes: [{
            ticks: {
              suggestedMin: 0,
              suggestedMax: 12
            }
          }]
        },
        showAllTooltips: true,
        tooltips: {
          callbacks: {
            beforeTitle: function([{ datasetIndex, index }], { datasets }) {
              const c = datasets[0].data[index].carbs;
              return c ? `${parseInt(c*100)/100}g` : '';
            },
            title: function([{ datasetIndex, index }], { datasets }) {
              const u = datasets[0].data[index].insulin;
              return u ? `${parseInt(u*100)/100}u` : '';
            },
            label: function() { return '' }
          }
        },
        annotation: {
          annotations: [{
            type: 'line',
            mode: 'horizontal',
            scaleID: 'y-axis-0',
            value: LOW,
            borderColor: 'rgb(255, 0, 0)',
            borderWidth: 1,
            label: {
              enabled: false
            }
          }, {
            type: 'line',
            mode: 'horizontal',
            scaleID: 'y-axis-0',
            value: HIGH,
            borderColor: 'rgb(255, 0, 0)',
            borderWidth: 1,
            label: {
              enabled: false
            }
          }]
        }
      }
    })
  }
}




function getMedianDataset(data) {
  return {
    label: 'Median',
    fill: false,
    pointRadius: 0,
    borderColor: 'rgb(0, 0, 100)',
    data: Object.values(data).map(getMedian).sort(sortProp.bind(null, 'timestamp')).map(pointify)
  };
}

const percentileConfig = [
  [10, '220,220,220', '+1'],
  [25, '176,196,222', 0],
  [75, '176,196,222', 0],
  [90, '220,220,220', '-1']
];

function getPercentileDatasets(data) {
  const ret = [];
  for (let [perc, color, fill] of percentileConfig) {
    ret.push(getPercentileDataset(perc, color, fill, data));
  }
  return ret;
}

function getPercentileDataset(perc, color, fill, data) {
  return {
    label: `${perc}th percentile`,
    fill,
    pointRadius: 0,
    backgroundColor: `rgb(${color})`,
    borderColor: `rgb(${color})`,
    data: Object.values(data).map(getPercentile.bind(null, perc, 'bg')).sort(sortProp.bind(null, 'timestamp')).map(pointify)
  }
}

function getMedian(arr) {
  const mid = Math.floor(arr.length / 2);
  const nums = arr.sort(sortProp.bind(null, 'bg'));
  return arr.length % 2 === 0 ? nums[mid] : { timestamp: nums[mid].timestamp, bg: (nums[mid].bg + nums[mid + 1].bg) / 2 };
}

function getPercentile(perc, prop, data) {
  return percentile(perc, data, item => item[prop]);
}

function sort(a, b) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function sortProp(propName, a, b) {
  return sort(a[propName], b[propName]);
}

function pointify({ timestamp, bg, carbs, insulin }) {
  return { x: timestamp, y: bg || carbs || insulin };
}

function pointifyKeep({ x, y }, obj) {
  obj.x = obj[x];
  obj.y = obj[y];
  delete obj[x];
  delete obj[y];
  return obj;
}

function pointifyKeepAll({ x, y }, obj) {
  obj.x = obj[x];
  obj.y = obj[y];
  return obj;
}

function distribution(in_data, prop) {
  const data = {};
  const today = new Date();
  for (const entry of in_data) {
    const date = new Date(entry.timestamp);
    const obj = {};
    date.setSeconds(0);
    date.setMilliseconds(0);
    const day = date.getDate();
    date.setDate(today.getDate());
    date.setMonth(today.getMonth());
    const key = `${date.getHours()}-${date.getMinutes()}`;
    if (data[key] == undefined) data[key] = [];
    obj.timestamp = date.getTime();
    obj[prop] = entry[prop];
    data[key].push(obj);
  }
  return data;
}

function distributionAVG(in_data, prop) {
  const data = {};
  const today = new Date();
  for (const entry of in_data) {
    const date = new Date(entry.timestamp);
    const obj = {};
    date.setSeconds(0);
    date.setMilliseconds(0);
    date.setMinutes(0);
    const day = date.getDate();
    date.setDate(today.getDate());
    date.setMonth(today.getMonth());
    const key = `${date.getHours()}}`;
    if (data[key] == undefined) data[key] = { timestamp: date.getTime(), count: 0, sum: 0 };
    data[key].count++;
    data[key].sum += entry[prop];
  }
  for (const entry of Object.values(data)) {
    entry[prop] = entry.sum / entry.count;
    delete entry.sum;
  }
  return data;
}

function splitByDay(in_data) {
  const data = {};
  const today = new Date();
  for (const prop of ['bg', 'carbs', 'insulin']) {
    for (const entry of in_data[prop]) {
      const date = new Date(entry.timestamp);
      const y = date.getFullYear() + '';
      const m = date.getMonth() + 1 + '';
      const d = date.getDate() + '';
      const key = m.padStart(2, 0) + d.padStart(2, 0);
      if (data[key] == undefined) data[key] = { label: `${y}/${m}/${d}` };
      if (data[key][prop] == undefined) data[key][prop] = [];
      data[key][prop].push({ timestamp: entry.timestamp, [prop]: entry[prop] });
    }
  }
  return data;
}

function removeDuplicates(prop, in_array) {
  const array = [];
  in_array.map(entry => {
    if (!array.find(ent => ent[prop] === entry[prop])) {
      array.push(entry);
    }
  })
  return array;
};
