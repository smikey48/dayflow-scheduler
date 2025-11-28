'use client';

import { useRouter } from 'next/navigation';

export default function GenerateAndGoToday() {
  const router = useRouter();

  function handleClick() {
    router.push('/today');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-block rounded-md border px-3 py-2 text-sm hover:underline"
    >
      Today
    </button>
  );
}


