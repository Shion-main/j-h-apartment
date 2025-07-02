'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, CheckCircle, Users, BarChart3, Star, AlertCircle, Loader2 } from 'lucide-react';
import Image from 'next/image';

function WelcomeContent() {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 text-white">
      <div className="mb-10">
        <Image
          src="/lib/Logo/J-H LOGO-WHITE.png"
          alt="J&H Apartment Logo"
          width={320}
          height={140}
          className="mx-auto"
          priority
        />
      </div>
      <h1 className="text-2xl md:text-3xl font-bold text-white">Professional Apartment Management System</h1>
      <p className="text-base md:text-lg text-blue-100">
        Streamline your property management with our comprehensive platform designed for modern apartment operations.
      </p>
      <div className="space-y-4 mt-8 text-left">
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
            <CheckCircle className="h-6 w-6 text-white" />
          </div>
          <div className="ml-4 flex flex-col justify-center">
            <div className="font-semibold text-base text-white">Automated Billing</div>
            <div className="text-blue-100 text-xs md:text-sm">Generate bills, track payments, and manage deposits automatically</div>
          </div>
        </div>
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div className="ml-4 flex flex-col justify-center">
            <div className="font-semibold text-base text-white">Tenant Management</div>
            <div className="text-blue-100 text-xs md:text-sm">Comprehensive tenant profiles with contract and payment history</div>
          </div>
        </div>
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="ml-4 flex flex-col justify-center">
            <div className="font-semibold text-base text-white">Smart Analytics</div>
            <div className="text-blue-100 text-xs md:text-sm">Real-time insights and detailed financial reporting</div>
          </div>
        </div>
      </div>
      <div className="flex justify-center space-x-8 mt-8 pt-4 border-t border-white/20">
        <div className="text-center">
          <div className="text-xl font-bold text-white">24/7</div>
          <div className="text-blue-100 text-xs">System Access</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-white">100%</div>
          <div className="text-blue-100 text-xs">Automated</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center">
            <span className="text-xl font-bold text-white">4.9</span>
            <Star className="h-5 w-5 ml-1 text-white" />
          </div>
          <div className="text-blue-100 text-xs">Efficiency</div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const blurRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [panelTranslate, setPanelTranslate] = useState(100); // percent, 100 = fully hidden

  // Mobile blur effect on scroll and scroll indicator
  useEffect(() => {
    const handleScroll = () => {
      if (!blurRef.current || !scrollRef.current) return;
      const scrollTop = scrollRef.current.scrollTop;
      const scrollHeight = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
      const progress = Math.min(scrollTop / (scrollHeight * 0.3), 1);
      blurRef.current.style.opacity = progress.toString();
      setShowScrollIndicator(scrollTop < 10);
      // Slide up the white panel as you scroll
      const maxTranslate = 100; // percent
      const minTranslate = 0; // percent
      // The panel starts at 100% (off screen), ends at 0% (fully visible)
      const translate = Math.max(minTranslate, maxTranslate - (scrollTop / scrollHeight) * maxTranslate);
      setPanelTranslate(translate);
    };
    const ref = scrollRef.current;
    if (ref) {
      ref.addEventListener('scroll', handleScroll, { passive: true });
      // Set initial state
      handleScroll();
      return () => ref.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      if (result.data.user) {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Mobile/Tablet Layout - Overlay Scrolling Experience */}
      <div className="lg:hidden relative h-screen overflow-hidden">
        {/* Welcome Section - Fixed Background */}
        <div className="fixed inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center p-4 z-0">
          <WelcomeContent />
          {/* Blur overlay, always behind the white overlay */}
          <div ref={blurRef} className="absolute inset-0 bg-blue-900 bg-opacity-20 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-500 z-10" />
        </div>
        {/* Scrollable Container */}
        <div ref={scrollRef} className="relative h-screen overflow-y-scroll z-20">
          {/* Initial Spacer - Shows welcome section */}
          <div className="h-[100vh] flex items-end justify-center p-4" />
          {/* Auth Forms Overlay - absolutely positioned, slides up */}
          <div
            className="min-h-[70vh] bg-white rounded-t-3xl shadow-2xl absolute left-0 right-0 mx-auto w-full max-w-md pb-16 z-30 transition-transform duration-300"
            style={{
              transform: `translateY(${panelTranslate}%)`,
              boxShadow: '0 -8px 32px 0 rgba(0,0,0,0.18)',
            }}
          >
            <div className="flex items-center justify-center min-h-[60vh] p-4">
              <form onSubmit={handleLogin} className="w-full max-w-sm mx-auto space-y-4 pb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">Sign In</h2>
                {error && (
                  <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 px-4 bg-gray-50 border-gray-200 rounded-lg focus:bg-white focus:border-blue-500"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 px-4 pr-12 bg-gray-50 border-gray-200 rounded-lg focus:bg-white focus:border-blue-500"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  disabled={isLoading || !email || !password}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </div>
          </div>
          {/* Scroll Indicator */}
          {showScrollIndicator && (
            <div className="text-center fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40">
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 border border-white/30 shadow-lg flex items-center space-x-3">
                <div className="w-5 h-7 border-2 border-white border-opacity-70 rounded-full flex justify-center">
                  <div className="w-1 h-2.5 bg-white bg-opacity-90 rounded-full mt-1.5 animate-bounce"></div>
                </div>
                <div className="text-white text-sm font-medium drop-shadow-lg">Scroll up to sign in</div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Desktop Layout - Static, Compact, No Scroll */}
      <div className="hidden lg:flex min-h-screen w-full bg-gray-50">
        {/* Left Side - Login Form */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-gray-100 p-8 relative z-10 transition-transform transition-shadow duration-300 ease-out hover:scale-[1.025] hover:shadow-[0_32px_80px_-10px_rgba(30,64,175,0.25)]">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
                <p className="text-gray-600 mt-2">Sign in to your account to continue</p>
              </div>
              
              {error && (
                <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 px-4 bg-gray-50 border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 px-4 pr-12 bg-gray-50 border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
              
              <Button
                type="submit"
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/30 hover:shadow-blue-600/30"
                disabled={isLoading || !email || !password}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Right Side - Welcome Content */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="w-full h-full bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-l-[40px] shadow-2xl shadow-blue-900/30 flex items-center justify-center p-8">
            <WelcomeContent />
          </div>
        </div>
      </div>
    </>
  );
} 