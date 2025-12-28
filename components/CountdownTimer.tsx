
import React, { useState, useEffect, useRef } from 'react';
import { getNextRunDate, formatDuration } from '../utils/helpers';

interface CountdownTimerProps {
    cron?: string;
    enabled?: boolean;
    precise?: boolean;
    className?: string;
    prefix?: string;
}

const CountdownTimer: React.FC<CountdownTimerProps> = React.memo(({ cron, enabled, precise, className, prefix = '' }) => {
    const [display, setDisplay] = useState('---');
    const targetDateRef = useRef<Date | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 1. 当配置变化时，计算下一次运行的目标时间 (昂贵操作，仅执行一次)
    useEffect(() => {
        if (!enabled || !cron) {
            targetDateRef.current = null;
            setDisplay('未开启');
            return;
        }

        const next = getNextRunDate(cron);
        if (!next) {
            targetDateRef.current = null;
            setDisplay('配置错误');
            return;
        }
        
        targetDateRef.current = next;
        
        // 立即更新一次显示
        const diff = next.getTime() - Date.now();
        if (diff < 0) setDisplay('00:00:00');
        else setDisplay(formatDuration(diff, precise));

    }, [cron, enabled, precise]);

    // 2. 独立的计时循环，仅执行轻量级减法 (廉价操作，每秒执行)
    useEffect(() => {
        if (!enabled || !cron) return;

        const loop = () => {
            if (!targetDateRef.current) return;

            const now = Date.now();
            const diff = targetDateRef.current.getTime() - now;

            if (diff <= 0) {
                // 时间到了，重新计算下一个目标时间 (Lazy Recalculation)
                const next = getNextRunDate(cron);
                if (next && next.getTime() > now) {
                    targetDateRef.current = next;
                    setDisplay(formatDuration(next.getTime() - now, precise));
                } else {
                    setDisplay('00:00:00');
                }
            } else {
                setDisplay(formatDuration(diff, precise));
            }
            
            // 使用 setTimeout 递归调用，确保每次执行间隔至少 1000ms
            timerRef.current = setTimeout(loop, 1000);
        };

        // 启动循环
        timerRef.current = setTimeout(loop, 1000);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [cron, enabled, precise]); 

    return (
        <span className={className || "font-mono tabular-nums"}>
            {prefix}{display}
        </span>
    );
});

export default CountdownTimer;
