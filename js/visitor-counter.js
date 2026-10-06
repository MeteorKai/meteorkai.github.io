/*!
 * 站点访客统计
 *
 * 计数后端：Vercount (https://events.vercount.one)
 * 不蒜子(busuanzi)官方计数接口长期 502，已弃用；但本脚本沿用了它那套 DOM 约定，
 * 所以页面里的 #busuanzi_value_site_uv / #busuanzi_value_site_pv 不用改。
 *
 * 历史基数：在主题 _config.yml 的 visitor_counter.base_* 里配置，
 * 会在新计数之上叠加，用于把换服务前的数字续上。
 */
(function () {
    var API = 'https://events.vercount.one/api/v2/log';
    var CACHE_KEY = 'visitorCountData';
    var TIMEOUT = 5000;
    var METRICS = ['site_pv', 'page_pv', 'site_uv'];

    var cfg = window.__visitorCounter || {};

    // 历史基数，只接受非负整数，配置写错也不会把计数搞乱
    function baseOf(value) {
        var n = parseInt(value, 10);
        return isFinite(n) && n > 0 ? n : 0;
    }

    var BASE = {
        site_uv: baseOf(cfg.baseUv),
        site_pv: baseOf(cfg.basePv),
        page_pv: baseOf(cfg.basePagePv)
    };

    var UV_COOKIE = 'vercount_uv_' +
        (location.host || 'unknown-host').replace(/[^a-zA-Z0-9_-]/g, '_');

    function byId(id) {
        return document.getElementById(id);
    }

    function readCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            var data = raw ? JSON.parse(raw) : null;
            return data && typeof data === 'object' ? data : null;
        } catch (e) {
            return null;
        }
    }

    function writeCache(payload) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } catch (e) {
            /* 隐私模式下写不进去，忽略即可 */
        }
    }

    // 正常返回形如 {status:"success", data:{...}}；异常时字段可能直接平铺
    function pick(payload) {
        if (!payload) return null;
        var src = payload.data && typeof payload.data === 'object' ? payload.data : payload;
        var out = {};
        for (var i = 0; i < METRICS.length; i++) {
            var key = METRICS[i];
            var n = parseInt(src[key], 10);
            out[key] = isFinite(n) && n > 0 ? n : 0;
        }
        return out;
    }

    function hasUvCookie() {
        var parts = document.cookie ? document.cookie.split(';') : [];
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (part.indexOf(UV_COOKIE + '=') === 0) {
                return part.slice(UV_COOKIE.length + 1) === '1';
            }
        }
        return false;
    }

    function markUv() {
        document.cookie = UV_COOKIE + '=1; path=/; max-age=31536000; samesite=lax';
    }

    // 基数 + 增量，写进所有用到的元素
    function render(increments) {
        for (var i = 0; i < METRICS.length; i++) {
            var key = METRICS[i];
            var total = BASE[key] + (increments && increments[key] ? increments[key] : 0);

            var valueIds = ['busuanzi_value_' + key, 'vercount_value_' + key];
            for (var j = 0; j < valueIds.length; j++) {
                var node = byId(valueIds[j]);
                if (node) node.textContent = String(total);
            }

            var boxIds = ['busuanzi_container_' + key, 'vercount_container_' + key];
            for (var k = 0; k < boxIds.length; k++) {
                var box = byId(boxIds[k]);
                if (box) box.style.display = 'inline';
            }
        }
    }

    function request(isNewUv) {
        var aborter = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = setTimeout(function () {
            if (aborter) aborter.abort();
        }, TIMEOUT);

        var options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: location.href, isNewUv: isNewUv })
        };
        if (aborter) options.signal = aborter.signal;

        fetch(API, options).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).then(function (json) {
            var increments = pick(json);
            if (increments) {
                writeCache(json);
                render(increments);
            }
        }).catch(function () {
            /* 接口不可用/超时：保留已渲染的基数或缓存值，不把页面留空 */
        }).then(function () {
            clearTimeout(timer);
        });
    }

    function run() {
        // 先把缓存（没有就只有基数）画出来，接口返回后再覆盖，避免出现空白
        render(pick(readCache()));

        // 本地 file:// 直接打开时不计数
        if (!/^https?:$/.test(location.protocol)) return;

        var isNewUv = !hasUvCookie();
        if (isNewUv) markUv();
        request(isNewUv);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
