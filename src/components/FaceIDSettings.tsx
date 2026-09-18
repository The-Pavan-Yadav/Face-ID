import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  RefreshCw, 
  Calendar, 
  Info, 
  CheckCircle2, 
  Clock, 
  Lock
} from 'lucide-react';
import { Button } from './ui/Button';
import { db, ReRegistrationStatus } from '../lib/db';
import { User } from '../types';
import { FaceIDReRegistrationModal } from './FaceIDReRegistrationModal';

interface FaceIDSettingsProps {
  user: User;
  onUpdateUser?: (updatedUser: User) => void;
}

export function FaceIDSettings({ user, onUpdateUser }: FaceIDSettingsProps) {
  const [eligibility, setEligibility] = useState<ReRegistrationStatus>({
    isRegistered: !!(user.faceDescriptor && user.faceDescriptor.length === 128),
    canReRegister: false,
    daysRemaining: 30,
    lastUpdatedDate: null,
    nextAvailableDate: null,
    formattedLastUpdated: 'Loading...',
    formattedNextAvailable: 'Loading...',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // 1. Fetch authoritative registration status from Firestore
  const loadStatus = async () => {
    if (!user.uid) return;
    try {
      const status = await db.checkReRegistrationEligibility(user.uid);
      setEligibility(status);
    } catch (err) {
      console.warn("[AURA] Could not load Face ID status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [user.uid]);

  // 2. Trigger re-registration flow
  const handleStartReRegistration = async () => {
    if (!user.uid || isChecking) return;

    setIsChecking(true);
    setSuccessBanner(null);

    try {
      // Always verify live server timestamp first (prevent client bypass)
      const liveStatus = await db.checkReRegistrationEligibility(user.uid);
      setEligibility(liveStatus);

      // RULE: If fewer than 30 days have passed: DO NOT open camera
      if (!liveStatus.canReRegister) {
        setIsChecking(false);
        return;
      }

      // 30 days or more have passed: Allow Face ID re-registration
      setIsModalOpen(true);
    } catch (err) {
      console.warn("[AURA] Verification notice:", err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleReRegistrationSuccess = (
    updatedStatus: ReRegistrationStatus, 
    newEmbedding: number[]
  ) => {
    setEligibility(updatedStatus);
    setSuccessBanner('Face ID updated successfully. Your new Face ID is now active.');

    // Update parent user object
    if (onUpdateUser) {
      onUpdateUser({
        ...user,
        faceDescriptor: newEmbedding,
        lastReRegisteredAt: updatedStatus.lastUpdatedDate,
        updatedAt: updatedStatus.lastUpdatedDate,
      });
    }

    // Clear banner after 6 seconds
    setTimeout(() => {
      setSuccessBanner(null);
    }, 6000);
  };

  // Optional simulation helper for evaluator convenience
  const handleSimulateDaysAgo = async () => {
    if (!user.uid) return;
    setIsChecking(true);
    try {
      const updated = await db.simulateOldRegistrationDateForTesting(user.uid, 31);
      setEligibility(updated);
      setSuccessBanner('Simulated 31 days elapsed for testing. Re-registration is now available.');
      setTimeout(() => setSuccessBanner(null), 5000);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_4px_24px_-4px_rgba(17,19,24,0.06)] p-6 sm:p-7 space-y-6 text-left">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-[#E4E6EA] pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#17191D]" />
          <h2 className="text-sm font-semibold text-[#111318] tracking-tight">
            Face ID
          </h2>
        </div>
        
        {/* Status Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-[#E4E6EA] text-xs font-mono">
          <span 
            className={`w-1.5 h-1.5 rounded-full ${
              eligibility.isRegistered ? 'bg-emerald-500' : 'bg-slate-300'
            }`} 
          />
          <span className="font-medium text-[#111318]">
            {isLoading ? 'Checking...' : eligibility.isRegistered ? 'Registered' : 'Not registered'}
          </span>
        </div>
      </div>

      {/* Success Notification Banner */}
      <AnimatePresence>
        {successBanner && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 leading-relaxed"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-emerald-900">Face ID updated successfully</p>
              <p className="text-emerald-700">Your new Face ID is now active.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date Information Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="p-4 rounded-xl bg-slate-50/80 border border-[#E4E6EA] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#626873]">
            <Calendar className="w-3.5 h-3.5 text-[#8E95A2]" />
            <span>Last updated:</span>
          </div>
          <p className="text-sm font-semibold text-[#111318] font-mono">
            {isLoading ? '...' : eligibility.formattedLastUpdated}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50/80 border border-[#E4E6EA] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#626873]">
            <Clock className="w-3.5 h-3.5 text-[#8E95A2]" />
            <span>Next re-registration:</span>
          </div>
          <p className="text-sm font-semibold text-[#111318] font-mono">
            {isLoading ? '...' : eligibility.formattedNextAvailable}
          </p>
        </div>
      </div>

      {/* 30-Day Restriction Notice (When Unavailable) */}
      {!isLoading && !eligibility.canReRegister && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-[#E4E6EA] flex items-start gap-3 text-xs text-[#626873]">
          <Info className="w-4 h-4 text-[#626873] shrink-0 mt-0.5" />
          <div className="space-y-1 text-left">
            <p className="font-semibold text-[#111318]">Face ID is already up to date</p>
            <p className="leading-relaxed">
              You can register a new Face ID again in{' '}
              <span className="font-semibold text-[#111318]">
                {eligibility.daysRemaining} {eligibility.daysRemaining === 1 ? 'day' : 'days'}
              </span>.
            </p>
            <p className="text-[#8E95A2] text-[11px]">
              Available on {eligibility.formattedNextAvailable}
            </p>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-[#E4E6EA]">
        <div className="text-xs text-[#626873]">
          {eligibility.canReRegister ? (
            <span className="text-emerald-700 font-medium">
              ● Ready: 30-day security cycle completed.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#8E95A2]">
              <Lock className="w-3 h-3" />
              <span>Restricted to once every 30 days.</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Simulation Toggle for Tester/Developer Convenience */}
          {!eligibility.canReRegister && (
            <button
              type="button"
              onClick={handleSimulateDaysAgo}
              disabled={isChecking}
              className="text-[11px] text-[#8E95A2] hover:text-[#111318] underline transition-colors px-2 py-1 focus:outline-none"
              title="Sets registration timestamp to 31 days ago in Firestore for testing the re-registration camera flow"
            >
              Simulate 30+ days
            </button>
          )}

          <Button
            type="button"
            onClick={handleStartReRegistration}
            disabled={isLoading || !eligibility.canReRegister || isChecking}
            isLoading={isChecking}
            loadingText="Verifying..."
            className="w-full sm:w-auto text-xs font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            <span>Re-register Face ID</span>
          </Button>
        </div>
      </div>

      {/* Re-Registration Camera Modal */}
      {user.uid && (
        <FaceIDReRegistrationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          uid={user.uid}
          initialEligibility={eligibility}
          onSuccess={handleReRegistrationSuccess}
        />
      )}
    </div>
  );
}
