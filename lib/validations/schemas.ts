import Joi from 'joi';

// Validation helper
export function validateSchema(schema: Joi.ObjectSchema, data: any) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const message = error.details.map(detail => detail.message).join(', ');
    return { error: message, value: null };
  }
  return { error: null, value };
}

const validationMessages = {
  // Tenant-related
  'string.min.fullName': 'Name must be at least {#limit} characters',
  'string.email': 'Please enter a valid email address',
  'number.min.electricity': 'Electricity reading cannot be negative',
  'any.only.advancePayment': 'Please collect the advance payment',
  'any.only.securityDeposit': 'Please collect the security deposit',
  
  // Bill-related
  'number.min.reading': 'Electricity reading cannot be negative',
  'number.min.waterAmount': 'Water charges cannot be negative',
  'number.min.extraFee': 'Extra charges cannot be negative',
  'number.min.payment': 'Payment amount must be greater than zero',
  'any.only.paymentMethod': 'Please select either Cash or GCash as payment method',
  
  // Branch-related
  'string.min.branchName': 'Branch name must be at least {#limit} characters',
  'string.min.address': 'Please provide a complete address (minimum {#limit} characters)',
  'number.base.monthlyRent': 'Please enter a valid monthly rent amount',
  'number.min.monthlyRent': 'Monthly rent must be greater than zero',
  'number.base.waterRate': 'Please enter a valid water rate',
  'number.base.electricityRate': 'Please enter a valid electricity rate',
  'number.base.rooms': 'Please enter a valid number of rooms',
  'number.integer.rooms': 'Number of rooms must be a whole number',
  'number.min.rooms': 'Please add at least one room',
  
  // Settings-related
  'number.min.penalty': 'Penalty percentage cannot be negative',
  'number.min.defaultRent': 'Default monthly rent must be greater than zero',
  'number.min.defaultWater': 'Water rate cannot be negative',
  'number.min.defaultElectricity': 'Electricity rate must be greater than zero',
  
  // Report-related
  'number.min.month': 'Month must be between 1 and 12',
  'number.max.month': 'Month must be between 1 and 12',
  'number.min.year': 'Please select a year from 2020 onwards',
  
  // Expense-related
  'string.min.description': 'Please provide a brief description (minimum {#limit} characters)',
  'number.positive.amount': 'Amount must be greater than zero',
  'string.uri.receipt': 'Please enter a valid receipt URL',
  
  // Move-out related
  'number.min.finalReading': 'Final electricity reading cannot be negative',
  'number.min.finalWater': 'Final water charges cannot be negative',
  'number.min.finalExtra': 'Extra charges cannot be negative',
  'string.min.editReason': 'Please provide a reason for the edit (minimum {#limit} characters)'
};

// Tenant Management Schemas
export const tenantMoveInSchema = Joi.object({
  full_name: Joi.string().min(2).max(100).required().messages({
    'string.min': validationMessages['string.min.fullName'],
    'string.max': 'Full name cannot exceed 100 characters',
    'any.required': 'Full name is required'
  }),
  email_address: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': validationMessages['string.email'],
    'any.required': 'Email address is required'
  }),
  phone_number: Joi.string().pattern(/^[0-9+\-\s()]+$/).required().messages({
    'string.pattern.base': 'Please enter a valid phone number',
    'any.required': 'Phone number is required'
  }),
  room_id: Joi.string().uuid().required().messages({
    'string.guid': 'Please select a valid room',
    'any.required': 'Room selection is required'
  }),
  rent_start_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid rent start date',
    'any.required': 'Rent start date is required'
  }),
  initial_electricity_reading: Joi.number().integer().min(0).required().messages({
    'number.base': 'Initial electricity reading must be a whole number',
    'number.integer': 'Initial electricity reading must be a whole number',
    'number.min': 'Initial electricity reading must be 0 or greater',
    'any.required': 'Initial electricity reading is required'
  }),
  advance_payment_received: Joi.boolean().valid(true).required().messages({
    'any.only': validationMessages['any.only.advancePayment'],
    'any.required': 'Advance payment confirmation is required'
  }),
  security_deposit_received: Joi.boolean().valid(true).required().messages({
    'any.only': validationMessages['any.only.securityDeposit'],
    'any.required': 'Security deposit confirmation is required'
  })
});

export const tenantMoveOutPhase1Schema = Joi.object({
  tenant_id: Joi.string().uuid().required(),
  move_out_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid move-out date',
    'any.required': 'Move-out date is required'
  }),
  present_electricity_reading: Joi.number().integer().min(0).required().messages({
    'number.base': 'Final electricity reading must be a whole number',
    'number.integer': 'Final electricity reading must be a whole number',
    'number.min': 'Final electricity reading must be 0 or greater',
    'any.required': 'Final electricity reading is required'
  }),
  water_amount: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'Water amount must be a whole number',
    'number.integer': 'Water amount must be a whole number',
    'number.min': 'Water amount must be 0 or greater'
  }),
  extra_fee: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'Extra fee must be a whole number',
    'number.integer': 'Extra fee must be a whole number',
    'number.min': 'Extra fee must be 0 or greater'
  }),
  extra_fee_description: Joi.string().allow('', null).optional()
});

// Billing Schemas
export const billGenerationSchema = Joi.object({
  tenant_id: Joi.string().uuid().required(),
  present_electricity_reading: Joi.number().integer().min(0).required().messages({
    'number.base': 'Present electricity reading must be a whole number',
    'number.integer': 'Present electricity reading must be a whole number',
    'number.min': 'Present electricity reading must be 0 or greater',
    'any.required': 'Present electricity reading is required'
  }),
  present_reading_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid reading date',
    'any.required': 'Present reading date is required'
  }),
  extra_fee: Joi.number().integer().min(0).allow(null).optional().default(0).messages({
    'number.base': 'Extra fee must be a whole number',
    'number.integer': 'Extra fee must be a whole number',
    'number.min': 'Extra fee must be 0 or greater'
  }),
  extra_fee_description: Joi.string().allow('', null).optional()
});

export const paymentRecordSchema = Joi.object({
  bill_id: Joi.string().uuid().required(),
  amount_paid: Joi.number().integer().min(1).required().messages({
    'number.base': 'Payment amount must be a whole number',
    'number.integer': 'Payment amount must be a whole number',
    'number.min': 'Payment amount must be greater than 0',
    'any.required': 'Payment amount is required'
  }),
  payment_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid payment date',
    'any.required': 'Payment date is required'
  }),
  payment_method: Joi.string().valid('cash', 'gcash').required().messages({
    'any.only': validationMessages['any.only.paymentMethod'],
    'any.required': 'Payment method is required'
  }),
  reference_number: Joi.when('payment_method', {
    is: 'gcash',
    then: Joi.string().min(1).required().messages({
      'string.empty': 'GCash reference number is required',
      'any.required': 'GCash reference number is required for GCash payments'
    }),
    otherwise: Joi.string().allow('', null).optional()
  }),
  notes: Joi.string().allow('', null).optional()
});

// Branch Management Schemas
export const branchSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'Branch name is required',
    'string.min': validationMessages['string.min.branchName'],
    'string.max': 'Branch name cannot exceed 100 characters'
  }),
  address: Joi.string().min(5).max(500).required().messages({
    'string.empty': 'Branch address is required',
    'string.min': validationMessages['string.min.address'],
    'string.max': 'Branch address cannot exceed 500 characters'
  }),
  monthly_rent_rate: Joi.number().integer().min(1).required().messages({
    'number.base': 'Monthly rent rate must be a whole number',
    'number.integer': 'Monthly rent rate must be a whole number',
    'number.min': 'Monthly rent rate must be greater than 0',
    'any.required': 'Monthly rent rate is required'
  }),
  water_rate: Joi.number().integer().min(0).required().messages({
    'number.base': 'Water rate must be a whole number',
    'number.integer': 'Water rate must be a whole number',
    'number.min': 'Water rate cannot be negative',
    'any.required': 'Water rate is required'
  }),
  electricity_rate: Joi.number().integer().min(1).required().messages({
    'number.base': 'Electricity rate must be a whole number',
    'number.integer': 'Electricity rate must be a whole number',
    'number.min': 'Electricity rate cannot be negative',
    'any.required': 'Electricity rate is required'
  }),
  room_number_prefix: Joi.string().max(10).optional().allow('', null).default('').messages({
    'string.max': 'Room number prefix cannot exceed 10 characters'
  }),
  numberOfRooms: Joi.number().integer().min(1).max(100).required().messages({
    'number.base': 'Number of rooms must be a valid number',
    'number.integer': 'Number of rooms must be a whole number',
    'number.min': 'Number of rooms must be at least 1',
    'number.max': 'Number of rooms cannot exceed 100',
    'any.required': 'Number of rooms is required'
  })
});

export const roomSchema = Joi.object({
  branch_id: Joi.string().uuid().required(),
  room_number: Joi.string().min(1).max(50).required().messages({
    'string.min': 'Room number is required',
    'string.max': 'Room number cannot exceed 50 characters',
    'any.required': 'Room number is required'
  }),
  monthly_rent: Joi.number().integer().min(1).required().messages({
    'number.base': 'Monthly rent must be a whole number',
    'number.integer': 'Monthly rent must be a whole number',
    'number.min': 'Monthly rent must be greater than 0',
    'any.required': 'Monthly rent is required'
  })
});

// Company Expense Schemas
export const expenseSchema = Joi.object({
  expense_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid expense date',
    'any.required': 'Expense date is required'
  }),
  amount: Joi.number().integer().min(1).required().messages({
    'number.base': 'Amount must be a whole number',
    'number.integer': 'Amount must be a whole number',
    'number.min': 'Amount must be greater than 0',
    'any.required': 'Amount is required'
  }),
  description: Joi.string().min(3).max(500).required().messages({
    'string.min': 'Description must be at least 3 characters',
    'string.max': 'Description cannot exceed 500 characters',
    'any.required': 'Description is required'
  }),
  category: Joi.string().valid(
    'Utilities',
    'Maintenance',
    'Salaries',
    'Supplies',
    'Repairs',
    'Insurance',
    'Legal',
    'Marketing',
    'Other'
  ).required().messages({
    'any.only': 'Please select a valid category',
    'any.required': 'Category is required'
  }),
  branch_id: Joi.string().uuid().allow(null).optional()
});

// Settings Schemas
export const settingsUpdateSchema = Joi.object({
  penalty_percentage: Joi.number().min(0).max(100).optional().messages({
    'number.min': 'Penalty percentage must be 0 or greater',
    'number.max': 'Penalty percentage cannot exceed 100%'
  })
});

export const branchRatesUpdateSchema = Joi.object({
  monthly_rent_rate: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Default monthly rent must be greater than 0'
  }),
  water_rate: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Water rate must be 0 or greater'
  }),
  electricity_rate: Joi.number().integer().min(1).optional().messages({
    'number.min': 'Electricity rate must be greater than 0'
  })
});

// Report Generation Schema
export const reportGenerationSchema = Joi.object({
  month: Joi.number().min(1).max(12).required().messages({
    'number.min': 'Month must be between 1 and 12',
    'number.max': 'Month must be between 1 and 12',
    'any.required': 'Month is required'
  }),
  year: Joi.number().min(2020).max(2100).required().messages({
    'number.min': 'Year must be 2020 or later',
    'number.max': 'Year cannot exceed 2100',
    'any.required': 'Year is required'
  }),
  emails: Joi.array().items(
    Joi.string().email({ tlds: { allow: false } }).messages({
      'string.email': 'Please enter valid email addresses'
    })
  ).min(1).required().messages({
    'array.min': 'At least one email address is required',
    'any.required': 'Email addresses are required'
  })
});

// Additional Expense Schema for Company Expenses
export const companyExpenseSchema = Joi.object({
  description: Joi.string().min(3).max(200).required().messages({
    'string.min': 'Description must be at least 3 characters',
    'string.max': 'Description cannot exceed 200 characters',
    'any.required': 'Description is required'
  }),
  amount: Joi.number().positive().precision(2).required().messages({
    'number.positive': 'Amount must be positive',
    'any.required': 'Amount is required'
  }),
  category: Joi.string().valid(
    'Office Supplies',
    'Utilities',
    'Maintenance',
    'Marketing',
    'Legal & Professional',
    'Insurance',
    'Travel',
    'Equipment',
    'Software & Subscriptions',
    'Miscellaneous'
  ).required().messages({
    'any.only': 'Please select a valid category',
    'any.required': 'Category is required'
  }),
  expense_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid expense date',
    'any.required': 'Expense date is required'
  }),
  receipt_url: Joi.string().uri().optional().allow('').messages({
    'string.uri': 'Receipt URL must be a valid URL'
  }),
  notes: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'Notes cannot exceed 500 characters'
  })
});

// System Settings Schema
export const systemSettingsSchema = Joi.object({
  penalty_percentage: Joi.number().min(0).max(100).required().messages({
    'number.base': 'Penalty percentage must be a number.',
    'number.min': 'Penalty percentage must be 0 or greater.',
    'number.max': 'Penalty percentage cannot exceed 100.',
    'any.required': 'Penalty percentage is required.'
  })
});

// Move-Out Schema
export const tenantMoveOutSchema = Joi.object({
  move_out_date: Joi.date().required().messages({
    'date.base': 'Please enter a valid move-out date',
    'any.required': 'Move-out date is required'
  }),
  final_electricity_reading: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Final electricity reading must be a whole number',
    'number.integer': 'Final electricity reading must be a whole number',
    'number.min': 'Final electricity reading must be 0 or greater'
  }),
  final_water_amount: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Final water amount must be a whole number',
    'number.integer': 'Final water amount must be a whole number',
    'number.min': 'Final water amount must be 0 or greater'
  }),
  extra_fees: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Extra fees must be a whole number',
    'number.integer': 'Extra fees must be a whole number',
    'number.min': 'Extra fees must be 0 or greater'
  }),
  extra_fee_description: Joi.string().max(200).optional().allow('').messages({
    'string.max': 'Extra fee description cannot exceed 200 characters'
  }),
  is_room_transfer: Joi.boolean().optional().default(false).messages({
    'boolean.base': 'Room transfer flag must be true or false'
  })
});

// Bill Editing Schema
export const billEditSchema = Joi.object({
  bill_id: Joi.string().uuid().required(),
  present_electricity_reading: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Present electricity reading must be a whole number',
    'number.integer': 'Present electricity reading must be a whole number',
    'number.min': 'Present electricity reading must be 0 or greater'
  }),
  present_reading_date: Joi.date().optional(),
  water_amount: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Water amount must be a whole number',
    'number.integer': 'Water amount must be a whole number',
    'number.min': 'Water amount must be 0 or greater'
  }),
  extra_fee: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Extra fee must be a whole number',
    'number.integer': 'Extra fee must be a whole number',
    'number.min': 'Extra fee must be 0 or greater'
  }),
  extra_fee_description: Joi.string().max(200).optional().allow(''),
  edit_reason: Joi.string().min(5).max(500).required().messages({
    'string.min': 'Edit reason must be at least 5 characters',
    'string.max': 'Edit reason cannot exceed 500 characters',
    'any.required': 'Edit reason is required'
  }),
  allow_fully_paid_edit: Joi.boolean().optional().default(false)
});

// Branch editing schema (for updates, doesn't require numberOfRooms)
export const branchEditSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Branch name must be at least 2 characters long',
    'string.max': 'Branch name cannot exceed 100 characters'
  }),
  address: Joi.string().min(5).max(500).optional().messages({
    'string.min': 'Branch address must be at least 5 characters long',
    'string.max': 'Branch address cannot exceed 500 characters'
  }),
  monthly_rent_rate: Joi.number().integer().min(1).optional().messages({
    'number.base': 'Monthly rent rate must be a whole number',
    'number.integer': 'Monthly rent rate must be a whole number',
    'number.min': 'Monthly rent rate must be greater than 0'
  }),
  water_rate: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Water rate must be a whole number',
    'number.integer': 'Water rate must be a whole number',
    'number.min': 'Water rate cannot be negative'
  }),
  electricity_rate: Joi.number().integer().min(1).optional().messages({
    'number.base': 'Electricity rate must be a whole number',
    'number.integer': 'Electricity rate must be a whole number',
    'number.min': 'Electricity rate cannot be negative'
  }),
  room_number_prefix: Joi.string().max(10).optional().allow('', null).messages({
    'string.max': 'Room number prefix cannot exceed 10 characters'
  }),
  updateRooms: Joi.boolean().optional().default(false)
}); 