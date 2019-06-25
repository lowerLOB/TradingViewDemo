function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

//const supportedResolutions = ["1", "3", "5", "15", "30", "60", "120", "D"]
const supportedResolutions = ["1", "5", "60", "120", "240"]
const config = {
    supported_resolutions: supportedResolutions
};
const api_root = 'http://110.173.57.98/wei/';
const history = {};
var lastBar = {},
	subscribeBarsTimer;

var symbol = getParameterByName("symbol"),
    symbolArr = symbol ? symbol.split("_") : "BTC_USDT".split("_");  // ETH_USDT   LTC_USDT

function updateBar(data, symbolInfo, resolution) {
    //console.log('updateBar resolution:'+resolution);
    var mins = 1;
     if (resolution=='3') {
        mins = 3;
    } else if (resolution=='5') {
        mins = 5;
    } else if (resolution=='15') {
        mins = 15;
    } else if (resolution=='30') {
        mins = 30;
    }else if (resolution=='60') {
        mins = 60;
    }else if (resolution=='120') {
        // 1 day in minutes === 1440
        mins = 120;
    } else if (resolution.includes('D')) {
        // 1 day in minutes === 1440
        mins = 1440;
    } else if (resolution.includes('W')) {
        // 1 week in minutes === 10080
        mins = 10080;
    }

    var coeff = mins * 60 *1000; //micro second

    //新数据真实的bar的时间ms
    var rounded = Math.floor(parseInt(data.tickcount, 10) / coeff) * coeff;
	var lastBarSec = lastBar.time
    //新数据应该是的bar的时间ms
    //var lastBarSec = lastBar.time*1+60000;

    var price = parseFloat(data.price);
	//console.log(rounded + " : " +lastBarSec+ " : "+symbolInfo + " : "+resolution)
    if (rounded > lastBarSec) {
        // create a new candle, use last close as open **PERSONAL CHOICE**
        lastBar = {
            time: rounded,
            open: lastBar.close,
            high: lastBar.close,
            low: lastBar.close,
            close: parseFloat(data.price),
        }
    } else {
        // update lastBar candle!
        if(price){
            if (price < lastBar.low) {
                lastBar.low = price
            } else if (price > lastBar.high) {
                lastBar.high = price
            }
            lastBar.close = price
        }

    }

}

var myFeedData = {
    onReady: cb => {
        console.log('=====onReady running')
        setTimeout(() => cb(config), 0)

    },
    searchSymbols: (userInput, exchange, symbolType, onResultReadyCallback) => {
        console.log('====Search Symbols running')
    },
    resolveSymbol: (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
        // expects a symbolInfo object in response
        console.log('======resolveSymbol running')
            //var split_data = symbolName.split(/[:/]/)
        var symbol_stub = {
            name: symbolName,
            description: '',
            type: 'crypto',
            session: '24x7',
            timezone: 'Asia/Shanghai',
            ticker: symbolName,
            //exchange: split_data[0],
            minmov: 1,
            pricescale: 1000000,
            supported_resolution: supportedResolutions,
            has_intraday: true,
            intraday_multipliers: ['1','60'],
            has_daily:true,
            has_weekly_and_monthly:false,
            volume_precision: 8,
            data_status: 'delayed_streaming',
        }
        setTimeout(function() {
            onSymbolResolvedCallback(symbol_stub)
            console.log('Resolving that symbol....', symbol_stub)
        }, 0)
    },
    getBars: function(symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback, firstDataRequest) {
        //console.log('=====getBars running');
        //var interval = resolution >= 60 ? '1h' : '1m';
        if(resolution=='1' || resolution==1){
            var interval = '1m';
        }else if(resolution=='60' || resolution==60){
            var interval = '1h';
        }else if(resolution.includes('D')){
            var interval = '1d';
        }

        var params = {
            "timestamp": parseInt(from.toString(),10)*1000,
            "symbol": symbolInfo.name,
            "interval": interval,
            "limit": 2000
        };
        $.ajax({
            url: api_root + 'kline.php', //
            data: JSON.stringify(params),
            method: 'POST',
            dataType: 'json',
            success: function(data) {
                var bars = [];
                if (data.data.length) {
                    //console.log(`Actually returned: ${new Date(data.TimeFrom * 1000).toISOString()} - ${new Date(data.TimeTo * 1000).toISOString()}`)
                    bars = data.data.map(el => {
                        return {
                            time: parseInt(el.tick_start, 10), //TradingView requires bar time in ms
                            low: parseFloat(el.low),
                            high: parseFloat(el.high),
                            open: parseFloat(el.open),
                            close: parseFloat(el.close),
                        }
                    });
                    if (firstDataRequest) {
                        lastBar = bars[bars.length - 1]
                        history[symbolInfo.name] = { lastBar: lastBar }
                    }
                    onHistoryCallback(bars, { noData: false })
                } else {
                    onHistoryCallback(bars, { noData: true })
                }
            }
        })
    },
    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
        console.log('===== subscribeBars resolution：',resolution);
        subscribeBarsTimer = setInterval(function() {
            var params = {
                "timestamp": lastBar.time / 1000,
                "symbol": symbolInfo.name
            };
            $.ajax({
                url: api_root + 'fenshi.php',
                data: params,
                method: 'POST',
                dataType: 'json',
                success: function(data) {
                    if (data.data.length) {
                        for (var i = 0; i < data.data.length; i++) {
                            updateBar(data.data[i], symbolInfo, resolution);
                            onRealtimeCallback(lastBar);
                        }
                    }
                }
            })
        }, 1000)
    },
    unsubscribeBars: subscriberUID => {
        console.log('=====unsubscribeBars running', subscriberUID);
        clearInterval(subscribeBarsTimer);
    },
    calculateHistoryDepth: (resolution, resolutionBack, intervalBack) => {
        //optional
        //console.log('=====calculateHistoryDepth running')
        // while optional, this makes sure we request 24 hours of minute data at a time
        // CryptoCompare's minute data endpoint will throw an error if we request data beyond 7 days in the past, and return no data
        return resolution < 60 ? { resolutionBack: 'D', intervalBack: '1' } : undefined
    },
    getMarks: (symbolInfo, startDate, endDate, onDataCallback, resolution) => {
        //optional
        console.log('=====getMarks running')
    },
    getTimeScaleMarks: (symbolInfo, startDate, endDate, onDataCallback, resolution) => {
        //optional
        console.log('=====getTimeScaleMarks running')
    },
    getServerTime: cb => {
        console.log('=====getServerTime running')
    }
}

//var myFeedData = new Datafeeds.UDFCompatibleDatafeed("https://demo_feed.tradingview.com");

TradingView.onready(function() {
    var widget = window.tvWidget = new TradingView.widget({
        debug: false, // uncomment this line to see Library errors and warnings in the console
        fullscreen: true,
        autosize: true,
//      width:'100%',
//      height:300,
        //symbol: 'ETHBTC',
        symbol: symbolArr[0]+symbolArr[1],
        //theme: 'default',
        interval: '1',
        container_id: "tradingview_container",
        //	BEWARE: no trailing slash is expected in feed URL
        datafeed: myFeedData,
        library_path: "charting_library/",
        locale: getParameterByName('lang') || "zh",
        timezone: 'Asia/Shanghai',
        //	Regression Trend-related functionality is not implemented yet, so it's hidden for a while
        drawings_access: { type: 'black', tools: [{ name: "Regression Trend" }] },
        custom_css_url: 'kline.css',
        //disabled_features: ["use_localstorage_for_settings", "timeframes_toolbar", "go_to_date", "header_saveload", "header_screenshot", "header_undo_redo", "header_settings", "header_compare", "header_fullscreen_button"],
        //: ["use_localstorage_for_settings"],
        disabled_features: ["use_localstorage_for_settings", "timeframes_toolbar", "go_to_date", "header_saveload", "header_screenshot", "header_undo_redo", "header_settings", "header_compare","header_symbol_search"],
        enabled_features: ["study_templates"],
        charts_storage_url: 'http://saveload.tradingview.com',
        charts_storage_api_version: "1.1",
        client_id: 'tradingview.com',
        user_id: 'public_user_id',
        //preset: "mobile",
        overrides: {
            "paneProperties.background": "#171b2b",
            "paneProperties.vertGridProperties.color": "#171b2b",
            "paneProperties.horzGridProperties.color": "#171b2b",
            "scalesProperties.textColor": "#51809F",
            "mainSeriesProperties.style": 1
        }
    });
})

	//切换symbol使用widget 的 setSymbol() 方法  例如
//$("#some-btn").click(function(){
// 	window.tvWidget.setSymbol("EOSUSDT");
//});
