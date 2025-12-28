
import React, { useState, useEffect, useRef } from 'react';
import { getNextRunDate, formatDuration } from '../utils/helpers';

interface CountdownTimerProps {
    cron?: string;
    enabled?: boolean;
    precise?: boolean;
    className?: string; // 允许自定义颜色
    prefix?: string;
}

const CountdownTimer: React.FC<CountdownTimerProps> = React.memo(({ cron, enabled, precise, className, prefix = '' }) => {
    const [display, setDisplay] = useState('---');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled || !cron) {
            setDisplay('未开启');
            return;
        }

        const tick = () => {
            const next = getNextRunDate(cron);
            if (!next) {
                setDisplay('配置错误');
                return;
            }
            const now = Date.now();
            const diff = next.getTime() - now;
            
            // 如果 diff 很小，croner 会自动跳到下一次，所以通常 diff > 0
            // 除非 cron 配置为很久以前且不再重复
            if (diff < 0) { 
                setDisplay('00:00:00');
            } else {
                setDisplay(formatDuration(diff, precise));
            }
        };

        tick(); // 立即执行一次
        timerRef.current = setInterval(tick, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [cron, enabled, precise]);

    return (
        <span className={className || "font-mono tabular-nums"}>
            {prefix}{display}
        </span>
    );
});

export default CountdownTimer;
