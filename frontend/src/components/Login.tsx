import { useState } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { login } from '../api/client';

interface Props {
    onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: Props) {
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const success = await login(password);

        if (success) {
            onLoginSuccess();
        } else {
            setError('Invalid password');
            setPassword('');
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Leonardo Bulk Studio</h1>
                    <p className="text-zinc-400">Enter your password to continue</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="password" className="block text-sm font-medium text-zinc-400">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                            autoFocus
                            disabled={isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !password}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            <>
                                <Lock className="w-4 h-4" />
                                Sign In
                            </>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <p className="text-center text-zinc-600 text-sm mt-6">
                    Bulk NFT generation powered by Leonardo AI
                </p>
            </div>
        </div>
    );
}
