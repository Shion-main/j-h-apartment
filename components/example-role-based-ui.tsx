'use client';

import { 
  AdminOnly, 
  BranchManagerOnly, 
  StaffOnly, 
  AdminOrBranchManager,
  CanManageUsers,
  CanGenerateBills,
  CanViewFinancialReports,
  CanViewAuditLogs
} from '@/components/ui/RoleBasedAccess';

export default function ExampleRoleBasedUI() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Role-Based Access Control Examples</h1>
      
      {/* Admin Only Section */}
      <AdminOnly>
        <div className="p-4 bg-red-100 border border-red-300 rounded">
          <h2 className="text-lg font-semibold text-red-800">Admin Only Section</h2>
          <p className="text-red-700">This content is only visible to administrators.</p>
          <button className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            Admin Action
          </button>
        </div>
      </AdminOnly>

      {/* Branch Manager Only Section */}
      <BranchManagerOnly>
        <div className="p-4 bg-blue-100 border border-blue-300 rounded">
          <h2 className="text-lg font-semibold text-blue-800">Branch Manager Section</h2>
          <p className="text-blue-700">This content is only visible to branch managers.</p>
          <button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Branch Manager Action
          </button>
        </div>
      </BranchManagerOnly>

      {/* Staff Only Section */}
      <StaffOnly>
        <div className="p-4 bg-green-100 border border-green-300 rounded">
          <h2 className="text-lg font-semibold text-green-800">Staff Section</h2>
          <p className="text-green-700">This content is only visible to staff members.</p>
          <button className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            Staff Action
          </button>
        </div>
      </StaffOnly>

      {/* Admin or Branch Manager Section */}
      <AdminOrBranchManager>
        <div className="p-4 bg-yellow-100 border border-yellow-300 rounded">
          <h2 className="text-lg font-semibold text-yellow-800">Admin or Branch Manager Section</h2>
          <p className="text-yellow-700">This content is visible to both admins and branch managers.</p>
          <button className="mt-2 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700">
            Management Action
          </button>
        </div>
      </AdminOrBranchManager>

      {/* Permission-based sections */}
      <CanManageUsers>
        <div className="p-4 bg-purple-100 border border-purple-300 rounded">
          <h2 className="text-lg font-semibold text-purple-800">User Management Section</h2>
          <p className="text-purple-700">This content is visible to users who can manage other users.</p>
          <button className="mt-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
            Manage Users
          </button>
        </div>
      </CanManageUsers>

      <CanGenerateBills>
        <div className="p-4 bg-indigo-100 border border-indigo-300 rounded">
          <h2 className="text-lg font-semibold text-indigo-800">Billing Section</h2>
          <p className="text-indigo-700">This content is visible to users who can generate bills.</p>
          <button className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Generate Bill
          </button>
        </div>
      </CanGenerateBills>

      <CanViewFinancialReports>
        <div className="p-4 bg-teal-100 border border-teal-300 rounded">
          <h2 className="text-lg font-semibold text-teal-800">Financial Reports Section</h2>
          <p className="text-teal-700">This content is visible to users who can view financial reports.</p>
          <button className="mt-2 px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">
            View Reports
          </button>
        </div>
      </CanViewFinancialReports>

      <CanViewAuditLogs>
        <div className="p-4 bg-orange-100 border border-orange-300 rounded">
          <h2 className="text-lg font-semibold text-orange-800">Audit Logs Section</h2>
          <p className="text-orange-700">This content is visible to users who can view audit logs.</p>
          <button className="mt-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
            View Audit Logs
          </button>
        </div>
      </CanViewAuditLogs>

      {/* Example with fallback */}
      <AdminOnly 
        fallback={
          <div className="p-4 bg-gray-100 border border-gray-300 rounded">
            <h2 className="text-lg font-semibold text-gray-800">Access Denied</h2>
            <p className="text-gray-700">You need admin privileges to access this section.</p>
          </div>
        }
      >
        <div className="p-4 bg-red-100 border border-red-300 rounded">
          <h2 className="text-lg font-semibold text-red-800">Admin Section with Fallback</h2>
          <p className="text-red-700">This content is only visible to administrators.</p>
        </div>
      </AdminOnly>
    </div>
  );
} 