import json
import os
import urllib.request
import urllib.error

def lambda_handler(event, context):
    """
    AWS Lambda handler to proxy LLM requests (OpenAI and Anthropic).
    Segregates API keys from the frontend and provides CORS support.
    """
    # CORS headers for cross-origin requests from the browser
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
        'Access-Control-Allow-Methods': 'OPTIONS,POST'
    }

    # Handle CORS preflight request (sent by modern browsers)
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }

    try:
        # Parse the request body from the incoming POST request
        body = json.loads(event.get('body', '{}'))
        system_prompt = body.get('systemPrompt')
        user_prompt = body.get('userPrompt')
        provider = body.get('provider', 'anthropic')
        cache_enabled = body.get('cacheEnabled', False)

        if not system_prompt or not user_prompt:
            return error_response(400, 'Missing systemPrompt or userPrompt', headers)

        if provider == 'anthropic':
            api_key = os.environ.get('ANTHROPIC_API_KEY')
            if not api_key:
                return error_response(500, 'ANTHROPIC_API_KEY environment variable not set in Lambda', headers)
            
            return call_anthropic(system_prompt, user_prompt, api_key, cache_enabled, headers)

        elif provider == 'openai':
            api_key = os.environ.get('OPENAI_API_KEY')
            if not api_key:
                return error_response(500, 'OPENAI_API_KEY environment variable not set in Lambda', headers)
            
            return call_openai(system_prompt, user_prompt, api_key, headers)

        return error_response(400, f'Unsupported provider: {provider}', headers)

    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON in request body', headers)
    except Exception as e:
        return error_response(500, f'Internal Server Error: {str(e)}', headers)

def call_anthropic(system_prompt, user_prompt, api_key, cache_enabled, headers):
    url = "https://api.anthropic.com/v1/messages"
    
    # Configure the payload based on whether prompt caching is desired
    if cache_enabled:
        payload = {
            "model": "claude-opus-5",
            "max_tokens": 4000,
            "temperature": 0.2,
            "system": [
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"}
                }
            ],
            "messages": [{"role": "user", "content": user_prompt}]
        }
    else:
        payload = {
            "model": "claude-opus-5",
            "max_tokens": 4000,
            "temperature": 0.2,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}]
        }
        
    req_headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    }
    
    return make_request(url, payload, req_headers, headers, lambda d: {
        'content': d['content'][0]['text'],
        'usage': d.get('usage', {})
    })

def call_openai(system_prompt, user_prompt, api_key, headers):
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 4000
    }
    
    req_headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    return make_request(url, payload, req_headers, headers, lambda d: {
        'content': d['choices'][0]['message']['content']
    })

def make_request(url, payload, req_headers, cors_headers, transform_fn):
    """
    Helper to perform the HTTP request and handle potential errors.
    """
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=req_headers, method='POST')
        
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_data = json.loads(res_body)
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps(transform_fn(res_data))
            }
    except urllib.error.HTTPError as e:
        error_content = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_content)
            error_msg = error_json.get('error', {}).get('message', error_content)
        except:
            error_msg = error_content
            
        return {
            'statusCode': e.code,
            'headers': cors_headers,
            'body': json.dumps({'error': f'Upstream LLM Provider Error: {error_msg}'})
        }
    except Exception as e:
        return error_response(500, f'Request failure: {str(e)}', cors_headers)

def error_response(status_code, message, headers):
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps({'error': message})
    }
