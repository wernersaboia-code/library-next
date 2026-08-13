'use client';

import { useEffect, useState } from 'react';
import {
  BookOpenIcon,
  BookmarkIcon,
  LibraryIcon,
} from 'lucide-react';

interface Stats {
  totalBooks: number;
  lendo: number;
  lidos: number;
  paginasLidas: number;
  naoLidos: number;
  porAno: Record<string, number>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/reading/stats').then((res) => {
      if (!res.ok) return;
      res.json().then(setStats);
    });
  }, []);

  if (!stats) return null;

  const cards = [
    {
      label: 'Total',
      value: stats.totalBooks,
      icon: LibraryIcon,
      color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
    },
    {
      label: 'Lendo',
      value: stats.lendo,
      icon: BookOpenIcon,
      color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    },
    {
      label: 'Lidos',
      value: stats.lidos,
      icon: BookmarkIcon,
      color: 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30',
    },
    {
      label: 'Páginas',
      value: stats.paginasLidas,
      icon: BookOpenIcon,
      color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30',
    },
  ];

  const anos = Object.entries(stats.porAno ?? {}).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm flex flex-col items-center"
          >
            <div className={`p-2 rounded-full mb-2 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <span className="text-2xl font-bold">{card.value}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {card.label}
            </span>
          </div>
        ))}
      </div>

      {anos.length > 0 && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Lidos por ano
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {anos.map(([ano, quantidade]) => (
              <span key={ano} className="text-sm">
                <span className="font-medium">{ano}</span>: {quantidade}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
