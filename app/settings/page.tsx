'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  Settings as SettingsIcon, 
  Percent, 
  DollarSign,
  Zap,
  Droplets,
  Loader2,
  Save
} from 'lucide-react';

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();
  const supabase = createClientComponentClient();
  
  // Form state for settings
  const [formData, setFormData] = useState({
    penalty_percentage: '',
    default_monthly_rent_rate: '',
    default_electricity_rate: '',
    default_water_rate: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');

      if (error) throw error;
      
      const settingsMap = data.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, string>);

      setFormData({
        penalty_percentage: settingsMap.penalty_percentage || '5',
        default_monthly_rent_rate: settingsMap.default_monthly_rent_rate || '1000',
        default_electricity_rate: settingsMap.default_electricity_rate || '10',
        default_water_rate: settingsMap.default_water_rate || '150',
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      addToast({
        type: 'error',
        title: 'Failed to fetch settings',
        message: 'Could not load current system settings.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const updates = Object.entries(formData).map(([key, value]) => ({
        key,
        value,
      }));

      // Use the API route instead of direct Supabase calls to ensure branch rates are updated
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
      }
      
      addToast({
        type: 'success',
        title: 'Settings Saved',
        message: 'Your changes have been saved successfully and all branch rates have been updated.'
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      addToast({
        type: 'error',
        title: 'Error Saving Settings',
        message: error.message || 'An unexpected error occurred.'
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
             <SettingsIcon className="h-8 w-8 text-primary mr-3" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure system-wide settings and business rules
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Percent className="h-5 w-5 mr-2 text-primary" />
                Billing & Penalty Settings
              </CardTitle>
              <CardDescription>
                Configure penalty rates and other billing rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="penalty_percentage">Penalty Percentage</Label>
                <div className="relative mt-1">
                  <Input
                    id="penalty_percentage"
                    type="number"
                    value={formData.penalty_percentage}
                    onChange={handleInputChange}
                    placeholder="e.g., 5"
                    className="pr-12"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Changes only affect future penalty calculations, not existing bills.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <DollarSign className="h-5 w-5 mr-2 text-primary" />
                Default Branch Rates
              </CardTitle>
              <CardDescription>
                Set default rates for new branches and update all existing branches.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="default_monthly_rent_rate">Monthly Rent Rate (PHP)</Label>
                <Input
                  id="default_monthly_rent_rate"
                  type="number"
                  value={formData.default_monthly_rent_rate}
                  onChange={handleInputChange}
                  placeholder="e.g., 5000.00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="default_electricity_rate">Electricity Rate (PHP per kWh)</Label>
                <Input
                  id="default_electricity_rate"
                  type="number"
                  value={formData.default_electricity_rate}
                  onChange={handleInputChange}
                  placeholder="e.g., 11.00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="default_water_rate">Water Rate (PHP per month)</Label>
                <Input
                  id="default_water_rate"
                  type="number"
                  value={formData.default_water_rate}
                  onChange={handleInputChange}
                  placeholder="e.g., 200.00"
                  className="mt-1"
                />
              </div>
            </CardContent>
            <CardContent className="pt-0">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> When you save these settings, all existing branches will be updated with the new rates. 
                  This affects future bill calculations for all branches.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save Changes</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
} 