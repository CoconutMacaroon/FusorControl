//
// fusor device status -> graph
//

var vizData = [];
var chart = null;
var vizFrozen = false;


var vizChannels = {
    'Heartbeat.beat': {name: 'Heartbeat', variable: 'beat', min: 0, max: 5, type: "momentary"},
    'TMP.tmp': {name: 'TMP status', variable: 'tmp', min: 0, max: 1, type: "discrete"},
    'TMP.pump_freq': {name: 'TMP frequency (Hz)', variable: 'pump_freq', min: 0, max: 1250, type: "continuous"},
    'TMP.pump_curr_amps': {name: 'TMP current (A)', variable: 'pump_curr_amps', min: 0, max: 2.5, type: "continuous"},
    'DIAPHRAGM.diaphragm_adc': {name: 'Rough pressure (adc)', variable: 'diaphragm_adc', min: 0, max: 110, type: "continuous"},
    'PIRANI.pirani_adc': {name: 'Fine pressure (adc)', variable: 'pirani_adc', min: 0, max: 1024, type: "continuous"},
    'VARIAC.input_volts': {name: 'Variac target (V)', variable: 'input_volts', min: 0, max: 130, type: "continuous"},
    'VARIAC.potentiometer': {name: 'Variac actual (V)', variable: 'potentiometer', min: 0, max: 130, type: "continuous"},
    'HV-LOWSIDE.variac_rms': {name: 'Variac RMS (V)', variable: 'variac_rms', min: 0, max: 130, type: "continuous"},
    'HV-LOWSIDE.nst_rms': {name: 'NST RMS (KV)', variable: 'nst_rms', min: 0, max: 15, type: "continuous"},
    'HV-LOWSIDE.cw_avg': {name: 'CW ABS AVG (KV)', variable: 'cw_avg', min: 0, max: 50, type: "continuous"},
    'HV-HIGHSIDE.hs_current_adc': {name: 'CW current (adc)', variable: 'hs_current_adc', min: 0, max: 50, type: "continuous"},
    'GC-SERIAL.cps': {name: 'GCW (cps)', variable: 'cps', min: 0, max: 100, type: "discrete trailing"},
    'PN-JUNCTION.total': {name: 'PNJ (adc)', variable: 'total', min: 0, max: 100, type: "continuous"}
};

function createViz() {
    var options = {
        zoomEnabled: true,
        animationEnabled: true,
        title: {
            text: ""
        },
        axisY: {
            title: "Percent",
            includeZero: true,
            suffix: " %",
            lineThickness: 1,
            maximum: 100
        },
        axisX: {
            title: "time",
            includeZero: false,
            suffix: " s",
            lineThickness: 1,
            viewportMinimum: 0,
            viewportMaximum: 60
        },
        legend: {
            cursor: "pointer",
            itemmouseover: function (e) {
                e.dataSeries.lineThickness = e.chart.data[e.dataSeriesIndex].lineThickness * 2;
                e.dataSeries.markerSize = e.chart.data[e.dataSeriesIndex].markerSize + 2;
                e.chart.render();
            },
            itemmouseout: function (e) {
                e.dataSeries.lineThickness = e.chart.data[e.dataSeriesIndex].lineThickness / 2;
                e.dataSeries.markerSize = e.chart.data[e.dataSeriesIndex].markerSize - 2;
                e.chart.render();
            },
            itemclick: function (e) {
                if (typeof (e.dataSeries.visible) === "undefined" || e.dataSeries.visible) {
                    e.dataSeries.visible = false;
                } else {
                    e.dataSeries.visible = true;
                }
                e.chart.render();
            }
        },
        toolTip: {
            shared: false,
            content: "{name}: t: {x}, y: {value}"
        },
        data: vizData,
        rangeChanging: function (e) {
            vizFrozen = (e.trigger !== "reset");
        }
    };
    for (var channel in vizChannels) {
        var dataSeries = {
            type: "line",
            name: vizChannels[channel].name,
            showInLegend: true,
            dataPoints: []
        };

        vizData.push(dataSeries);
        vizChannels[channel].dataSeries = dataSeries;
    }

    chart = new CanvasJS.Chart("chartContainer", options);
    chart.render();
}


function resetViz() {
    for (var channel in vizChannels) {
        var vc = vizChannels[channel];
        vc.dataSeries.dataPoints = [];
        maxTime = 0;
        startTime = undefined;
        logstart = undefined;
        vc.offset = undefined;
    }
    chart.render();
}

function updateViz(dataArray, batchStartTime) {
    for (var i = 0; i < dataArray.length; i++) {
        var data = dataArray[i];
        var devicename = data["device"];
        var devicedata = data["data"];

        if (devicename === "<reset>") {
            // restart visualization with fresh log data
            resetViz();
            continue;
        }

        if (devicename === "comment") {
            // display chat comment - see comment.js
            displayComment(devicedata["observer"], data["servertime"], devicedata["text"]);
            continue;
        }

        //
        // now add important variables to display
        // see declaration of vizChannels above to see what is included
        //

        for (var variable in devicedata) {
            var vc = vizChannels[devicename + "." + variable];
            if (vc === undefined) {
                continue;
            }
            var dataSeries = vc.dataSeries;

            // get value for this channel
            var value = Number(devicedata[variable]["value"]);
            var percent = (Math.abs(value) - vc.min) * 100 / (vc.max - vc.min);

            // get the three relevant timestamps, and do the math
            if (vc.offset === undefined) {
                var serverTime = Number(data["servertime"]);
                var deviceTime = Number(devicedata["devicetime"]);
                if (startTime === undefined) {
                    startTime = serverTime;
                    logStart = serverTime;
                }
                var offset = deviceTime - (serverTime - startTime);
                if (!isNaN(offset)) {
                    vc.offset = offset;
                }
            }
            var varTime = Number(devicedata[variable]["vartime"]);
            varTime -= vc.offset;
            varTime = Math.max(varTime, 0);
            var secs = Math.round(varTime * 10) / 10000;

            maxTime = Math.max(maxTime, secs);
            if (liveServer) {
                if (!vizFrozen) {
                    chart.axisX[0].set("viewportMinimum", Math.max(maxTime - 60, 0));
                    chart.axisX[0].set("viewportMaximum", Math.max(maxTime, 60));
                }
            }

            //console.log("x: "+varTime+" y: "+percent)

            switch (vc.type) {
                case "momentary":
                    dataSeries.dataPoints.push({x: secs - 0.0001, y: 0, value: 0});
                    dataSeries.dataPoints.push({x: secs, y: percent, value: value});
                    dataSeries.dataPoints.push({x: secs + 0.0001, y: 0, value: 0});
                    break;

                case "discrete":
                    dataSeries.dataPoints.push({x: secs - 0.0001, y: 0, value: 0});
                    dataSeries.dataPoints.push({x: secs, y: percent, value: value});
                    break;

                case "discrete trailing":
                    if (dataSeries.dataPoints.length > 0) {
                        var lastPoint = dataSeries.dataPoints[dataSeries.dataPoints.length - 1];
                        dataSeries.dataPoints.push({x: lastPoint.x + 0.0001, y: percent, value: value});
                        dataSeries.dataPoints.push({x: secs, y: 0, value: 0});
                    }
                    break;

                case "continuous":
                default:
                    dataSeries.dataPoints.push({x: secs, y: percent, value: value});
                    break;
            }
            // in live view, constrain ourselves to 1200 data points per series - should work out to two minutes
            if (liveServer) {
                while (dataSeries.dataPoints.length > 600) {
                    dataSeries.dataPoints.shift();
                }
            }
        }
    }
    if (!liveServer) {
        chart.axisX[0].set("viewportMinimum", 0);
        chart.axisX[0].set("viewportMaximum", maxTime);
    }

    chart.render();
}








        