import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
        <h1 className="mb-6 text-center text-2xl font-bold">Book Inventory</h1>
        <p className="mb-8 text-center text-gray-500">
          Faça login com sua conta Google para acessar sua biblioteca.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
          >
            Entrar com Google
          </button>
        </form>
      </div>
    </div>
  );
}
