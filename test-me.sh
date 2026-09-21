#!/bin/bash
TOKEN="your_jwt_token_here"
curl -s "http://localhost:5000/api/auth/me" -H "Authorization: Bearer $TOKEN" | jq .
