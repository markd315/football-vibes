# Use Python to serve static files
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy all application files
COPY . .

# Expose port 8000
EXPOSE 8000

# Start Python HTTP server
CMD ["python", "-m", "http.server", "8000"]

