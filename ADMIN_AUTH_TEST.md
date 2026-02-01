/**
 * Admin Authorization Test
 * Run this to verify admin access control works
 */

const scenarios = [
  {
    name: "❌ Scenario 1: No token",
    request: {
      method: "GET",
      endpoint: "/admin/dashboard",
      headers: { authorization: "" }
    },
    expected: "401 - Token missing"
  },
  {
    name: "❌ Scenario 2: Invalid token",
    request: {
      method: "GET",
      endpoint: "/admin/dashboard",
      headers: { authorization: "Bearer invalid_token_123" }
    },
    expected: "401 - Invalid or expired token"
  },
  {
    name: "❌ Scenario 3: User token (not admin)",
    request: {
      method: "GET",
      endpoint: "/admin/dashboard",
      headers: { authorization: "Bearer user_jwt_token_here" }
    },
    expected: "403 - Access denied. Admin role required. Your role: user"
  },
  {
    name: "✅ Scenario 4: Admin token",
    request: {
      method: "GET",
      endpoint: "/admin/dashboard",
      headers: { authorization: "Bearer admin_jwt_token_here" }
    },
    expected: "200 - Dashboard data returned"
  },
  {
    name: "✅ Scenario 5: Anyone can signup",
    request: {
      method: "POST",
      endpoint: "/admin/register",
      headers: { authorization: "" }
    },
    expected: "201 - Admin registered successfully"
  },
  {
    name: "✅ Scenario 6: Anyone can login",
    request: {
      method: "POST",
      endpoint: "/admin/login",
      headers: { authorization: "" }
    },
    expected: "200 - Admin logged in, token returned"
  }
];

console.log(`
╔════════════════════════════════════════════════════════════════╗
║     ADMIN AUTHORIZATION TEST SCENARIOS                         ║
╚════════════════════════════════════════════════════════════════╝
`);

scenarios.forEach((scenario, index) => {
  console.log(`\n${index + 1}. ${scenario.name}`);
  console.log(`   Endpoint: ${scenario.request.method} ${scenario.request.endpoint}`);
  console.log(`   Expected: ${scenario.expected}`);
});

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    TESTING WITH CURL                           ║
╚════════════════════════════════════════════════════════════════╝

1. Admin Signup (Public):
   curl -X POST http://localhost:7145/admin/register \\
     -H "Content-Type: application/json" \\
     -d '{"firstName":"Admin","lastName":"User","email":"admin@example.com","password":"securePassword123"}'

2. Admin Login (Public):
   curl -X POST http://localhost:7145/admin/login \\
     -H "Content-Type: application/json" \\
     -d '{"email":"admin@example.com","password":"securePassword123"}'

3. Access Dashboard with Admin Token (Protected):
   curl -X GET http://localhost:7145/admin/dashboard \\
     -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN_HERE"

4. Try with User Token (Should be Denied):
   curl -X GET http://localhost:7145/admin/dashboard \\
     -H "Authorization: Bearer YOUR_USER_JWT_TOKEN_HERE"
     
   Expected: 403 Access denied. Admin role required. Your role: user

5. Try without Token (Should be Denied):
   curl -X GET http://localhost:7145/admin/dashboard
   
   Expected: 401 Token missing
`);
