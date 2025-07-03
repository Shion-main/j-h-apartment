import { useEffect } from 'react';

// Performance monitoring utilities for the billing page

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(name: string): void {
    if (typeof performance !== 'undefined') {
      this.metrics.set(`${name}_start`, [performance.now()]);
    }
  }

  endTimer(name: string): number {
    if (typeof performance !== 'undefined') {
      const startTime = this.metrics.get(`${name}_start`)?.[0];
      if (startTime) {
        const duration = performance.now() - startTime;
        
        // Store duration
        const durations = this.metrics.get(name) || [];
        durations.push(duration);
        this.metrics.set(name, durations);
        
        // Log if duration is concerning
        if (duration > 1000) {
          console.warn(`Performance: ${name} took ${duration.toFixed(2)}ms`);
        }
        
        return duration;
      }
    }
    return 0;
  }

  getAverageTime(name: string): number {
    const durations = this.metrics.get(name) || [];
    if (durations.length === 0) return 0;
    
    const sum = durations.reduce((a, b) => a + b, 0);
    return sum / durations.length;
  }

  getMetrics(): Record<string, { average: number; count: number; max: number; min: number }> {
    const result: Record<string, { average: number; count: number; max: number; min: number }> = {};
    
    this.metrics.forEach((durations, name) => {
      if (name.endsWith('_start')) return;
      
      if (durations.length > 0) {
        result[name] = {
          average: durations.reduce((a, b) => a + b, 0) / durations.length,
          count: durations.length,
          max: Math.max(...durations),
          min: Math.min(...durations)
        };
      }
    });
    
    return result;
  }

  logMetrics(): void {
    console.group('Performance Metrics');
    const metrics = this.getMetrics();
    
    Object.entries(metrics).forEach(([name, stats]) => {
      console.log(`${name}:`, {
        average: `${stats.average.toFixed(2)}ms`,
        count: stats.count,
        max: `${stats.max.toFixed(2)}ms`,
        min: `${stats.min.toFixed(2)}ms`
      });
    });
    
    console.groupEnd();
  }

  reset(): void {
    this.metrics.clear();
  }
}

// Hook for easy performance monitoring
export function usePerformanceMonitor() {
  const monitor = PerformanceMonitor.getInstance();
  
  const startTimer = (name: string) => monitor.startTimer(name);
  const endTimer = (name: string) => monitor.endTimer(name);
  const getMetrics = () => monitor.getMetrics();
  const logMetrics = () => monitor.logMetrics();
  const reset = () => monitor.reset();
  
  return {
    startTimer,
    endTimer,
    getMetrics,
    logMetrics,
    reset
  };
}

// React hook for timing component renders
export function useRenderTime(componentName: string) {
  const monitor = PerformanceMonitor.getInstance();
  
  useEffect(() => {
    monitor.startTimer(`${componentName}_render`);
    
    return () => {
      monitor.endTimer(`${componentName}_render`);
    };
  });
}
