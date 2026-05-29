"use client";

import { useRef, useState, useCallback } from "react";
import { Chart } from "primereact/chart";

interface ZoomableChartProps {
  type: "line" | "bar" | "pie" | "doughnut" | "radar" | "polarArea";
  data: any;
  options: any;
  className?: string;
}

export default function ZoomableChart({
  type,
  data,
  options,
  className,
}: ZoomableChartProps) {
  const chartRef = useRef<any>(null);
  const [zoomed, setZoomed] = useState(false);

  const resetZoom = useCallback(() => {
    const chart = chartRef.current?.getChart?.();
    if (chart) {
      chart.resetZoom();
      setZoomed(false);
    }
  }, []);

  const augmentedOptions = {
    ...options,
    plugins: {
      ...options?.plugins,
      zoom: {
        ...options?.plugins?.zoom,
        zoom: {
          ...options?.plugins?.zoom?.zoom,
          onZoomComplete: () => setZoomed(true),
        },
      },
    },
  };

  return (
    <div className="relative w-full h-full">
      {zoomed && (
        <button
          onClick={resetZoom}
          className="absolute top-1 right-1 z-10 text-xs px-2 py-1 rounded
                     bg-white/90 border border-gray-300 text-gray-600
                     hover:bg-gray-100 hover:text-gray-800 transition-colors
                     shadow-sm backdrop-blur-sm cursor-pointer"
        >
          Reset Zoom
        </button>
      )}
      <Chart
        ref={chartRef}
        type={type}
        data={data}
        options={augmentedOptions}
        className={className}
      />
    </div>
  );
}
