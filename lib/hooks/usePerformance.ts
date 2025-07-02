import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { debounce, throttle, createCache, PerformanceMonitor } from '@/lib/utils';

/**
 * Hook for debounced values
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for debounced callbacks
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps?: React.DependencyList
): T {
  return useCallback(
    debounce(callback, delay),
    deps ? [...deps, delay] : [delay]
  ) as T;
}

/**
 * Hook for throttled callbacks
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps?: React.DependencyList
): T {
  return useCallback(
    throttle(callback, delay),
    deps ? [...deps, delay] : [delay]
  ) as T;
}

/**
 * Hook for caching with TTL
 */
export function useCache<T>() {
  const cache = useMemo(() => createCache<T>(), []);
  
  const set = useCallback((key: string, value: T, ttl?: number) => {
    cache.set(key, value, ttl);
  }, [cache]);
  
  const get = useCallback((key: string): T | null => {
    return cache.get(key);
  }, [cache]);
  
  const has = useCallback((key: string): boolean => {
    return cache.has(key);
  }, [cache]);
  
  const remove = useCallback((key: string) => {
    cache.delete(key);
  }, [cache]);
  
  const clear = useCallback(() => {
    cache.clear();
  }, [cache]);
  
  return { set, get, has, remove, clear };
}

/**
 * Hook for performance monitoring
 */
export function usePerformanceMonitor(label: string) {
  const isMonitoring = useRef(false);
  
  const start = useCallback(() => {
    if (!isMonitoring.current) {
      PerformanceMonitor.start(label);
      isMonitoring.current = true;
    }
  }, [label]);
  
  const end = useCallback(() => {
    if (isMonitoring.current) {
      const duration = PerformanceMonitor.end(label);
      isMonitoring.current = false;
      return duration;
    }
    return 0;
  }, [label]);
  
  const getStats = useCallback(() => ({
    averageTime: PerformanceMonitor.getAverageTime(label),
    totalCalls: PerformanceMonitor.getTotalCalls(label)
  }), [label]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isMonitoring.current) {
        PerformanceMonitor.end(label);
      }
    };
  }, [label]);
  
  return { start, end, getStats };
}

/**
 * Hook for optimized async operations with caching
 */
export function useAsyncCache<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  deps: React.DependencyList = [],
  cacheKey?: (...args: Args) => string,
  ttl: number = 300000 // 5 minutes default
) {
  const cache = useCache<T>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    const key = cacheKey ? cacheKey(...args) : JSON.stringify(args);
    
    // Check cache first
    const cached = cache.get(key);
    if (cached !== null) {
      return cached;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await asyncFn(...args);
      cache.set(key, result, ttl);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [asyncFn, cache, cacheKey, ttl, ...deps]);
  
  const invalidate = useCallback((keyOrFn?: string | ((...args: Args) => string)) => {
    if (typeof keyOrFn === 'string') {
      cache.remove(keyOrFn);
    } else if (typeof keyOrFn === 'function') {
      // This is a simplified approach - in production you might want a more sophisticated cache invalidation
      cache.clear();
    } else {
      cache.clear();
    }
  }, [cache]);
  
  return { execute, invalidate, isLoading, error };
}

/**
 * Hook for batch processing with performance optimization
 */
export function useBatchProcessor<T, R>(
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delay: number = 0
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<R[]>([]);
  const [error, setError] = useState<Error | null>(null);
  
  const process = useCallback(async (items: T[]): Promise<R[]> => {
    setIsProcessing(true);
    setError(null);
    setProgress({ completed: 0, total: items.length });
    setResults([]);
    
    try {
      const allResults: R[] = [];
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        
        allResults.push(...batchResults);
        setResults([...allResults]);
        setProgress({ completed: Math.min(i + batchSize, items.length), total: items.length });
        
        // Optional delay between batches
        if (delay > 0 && i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      return allResults;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return [];
    } finally {
      setIsProcessing(false);
    }
  }, [processor, batchSize, delay]);
  
  return { process, isProcessing, progress, results, error };
}

/**
 * Hook for optimized data fetching with automatic retries
 */
export function useOptimizedFetch<T>(
  url: string,
  options?: RequestInit,
  retries: number = 3,
  retryDelay: number = 1000
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const fetchData = useCallback(async (customUrl?: string, customOptions?: RequestInit) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setIsLoading(true);
    setError(null);
    
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await fetch(customUrl || url, {
          ...options,
          ...customOptions,
          signal: controller.signal
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        setData(result);
        return result;
      } catch (err) {
        attempt++;
        
        if (err instanceof Error && err.name === 'AbortError') {
          return null; // Request was cancelled
        }
        
        if (attempt >= retries) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          return null;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
    
    setIsLoading(false);
  }, [url, options, retries, retryDelay]);
  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  return { data, isLoading, error, fetchData, refetch: () => fetchData() };
} 