-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.bills (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  room_id uuid NOT NULL,
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  due_date date NOT NULL,
  previous_electricity_reading numeric NOT NULL,
  present_electricity_reading numeric NOT NULL,
  present_reading_date date NOT NULL,
  electricity_consumption numeric NOT NULL,
  electricity_amount numeric NOT NULL,
  water_amount numeric NOT NULL,
  monthly_rent_amount numeric NOT NULL,
  extra_fee numeric NOT NULL DEFAULT 0,
  extra_fee_description text,
  penalty_amount numeric NOT NULL DEFAULT 0,
  total_amount_due numeric NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  status USER-DEFINED NOT NULL DEFAULT 'active'::bill_status_enum,
  is_final_bill boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  advance_payment numeric,
  security_deposit numeric,
  applied_advance_payment numeric DEFAULT 0 CHECK (applied_advance_payment >= 0::numeric),
  applied_security_deposit numeric DEFAULT 0 CHECK (applied_security_deposit >= 0::numeric),
  forfeited_amount numeric DEFAULT 0 CHECK (forfeited_amount >= 0::numeric),
  refund_amount numeric DEFAULT 0 CHECK (refund_amount >= 0::numeric),
  CONSTRAINT bills_pkey PRIMARY KEY (id),
  CONSTRAINT bills_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT bills_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT bills_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id)
);
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  address text NOT NULL,
  monthly_rent_rate numeric NOT NULL,
  water_rate numeric NOT NULL,
  electricity_rate numeric NOT NULL,
  room_number_prefix text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT branches_pkey PRIMARY KEY (id)
);
CREATE TABLE public.company_expenses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  expense_date date NOT NULL,
  amount numeric NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  branch_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT company_expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id)
);
CREATE TABLE public.payment_components (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  component_type text NOT NULL CHECK (component_type = ANY (ARRAY['rent'::text, 'electricity'::text, 'water'::text, 'extra_fee'::text, 'penalty'::text])),
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_components_pkey PRIMARY KEY (id),
  CONSTRAINT payment_components_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id),
  CONSTRAINT payment_components_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  bill_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_date timestamp with time zone NOT NULL,
  payment_method text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reference_number text,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  email text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  role_name text NOT NULL UNIQUE,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rooms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid NOT NULL,
  room_number text NOT NULL,
  monthly_rent numeric NOT NULL,
  is_occupied boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id)
);
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  full_name text NOT NULL,
  phone_number text NOT NULL,
  email_address text NOT NULL,
  branch_id uuid NOT NULL,
  room_id uuid,
  rent_start_date date NOT NULL,
  initial_electricity_reading numeric NOT NULL,
  advance_payment numeric NOT NULL,
  security_deposit numeric NOT NULL,
  contract_start_date date NOT NULL,
  contract_end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  move_out_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenants_pkey PRIMARY KEY (id),
  CONSTRAINT tenants_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT tenants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id)
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id)
);