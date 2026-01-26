# Example Output: README Rendering

## Input: Readme Schema Object

```typescript
const readme: Readme = {
  title: "Weather CLI",
  tagline: "Real-time weather from the command line in seconds",
  description: "A lightweight Python CLI tool that fetches real-time weather data from OpenWeatherMap. Just type a city name and get instant temperature, humidity, and conditions. Perfect for checking weather without opening a browser.",

  features: [
    {
      title: "Real-time Data",
      description: "Fetches current weather conditions every time you run it"
    },
    {
      title: "Multiple Cities",
      description: "Search weather for any city in the world"
    },
    {
      title: "Temperature Units",
      description: "Display temperature in Celsius, Fahrenheit, or Kelvin"
    }
  ],

  prerequisites: [
    "Python 3.8 or higher",
    "Internet connection",
    "OpenWeatherMap API key (free tier available)"
  ],

  installationSteps: [
    {
      stepNumber: 1,
      instruction: "Clone the repository",
      explanation: "Get a copy of the code on your computer"
    },
    {
      stepNumber: 2,
      instruction: "pip install -r requirements.txt",
      explanation: "Install required dependencies (requests library)"
    },
    {
      stepNumber: 3,
      instruction: "cp .env.example .env && nano .env",
      explanation: "Create config file and add your OpenWeatherMap API key"
    }
  ],

  usageExamples: [
    {
      title: "Basic Usage",
      description: "Get weather for any city with a simple command",
      code: "python weather.py London",
      expectedOutput: "🌤️ London: 15°C, Partly Cloudy, Humidity: 65%"
    },
    {
      title: "Fahrenheit Units",
      description: "Display temperature in Fahrenheit",
      code: "python weather.py --units fahrenheit New York",
      expectedOutput: "🌞 New York: 59°F, Sunny, Humidity: 45%"
    },
    {
      title: "Multiple Cities",
      description: "Check weather for multiple cities at once",
      code: "python weather.py London Paris Tokyo",
      expectedOutput: "🌤️ London: 15°C, Partly Cloudy\n🌞 Paris: 18°C, Sunny\n🌧️ Tokyo: 22°C, Rainy"
    }
  ],

  architecture: {
    overview: "The app is built in three layers: a CLI argument parser that handles user input, a data fetcher that calls the OpenWeatherMap API, and a formatter that displays results beautifully with emoji icons and consistent spacing.",
    diagram: `weather.py
├── main()
│   ├── parse_arguments()
│   ├── fetch_weather()
│   └── format_output()
├── api.py
│   └── get_weather_data(city, units)
└── utils.py
    └── format_temperature(temp, units)`,
    files: [
      {
        path: "weather.py",
        purpose: "Main entry point, argument parsing, and output formatting"
      },
      {
        path: "api.py",
        purpose: "Handles API calls to OpenWeatherMap and error handling"
      },
      {
        path: ".env.example",
        purpose: "Template for configuration with API key placeholder"
      }
    ],
    designDecisions: [
      "Used requests library for simple, clean HTTP calls instead of urllib",
      "Separated API logic from UI formatting for easier testing",
      "Store API key in .env file instead of hardcoding for security"
    ]
  },

  technicalDetails: {
    dependencies: [
      {
        name: "requests",
        version: "2.28.0",
        purpose: "HTTP client library for making API calls"
      },
      {
        name: "python-dotenv",
        version: "0.20.0",
        purpose: "Load environment variables from .env file"
      }
    ],
    keyAlgorithms: [
      "Simple string matching for city name lookup (linear search)",
      "JSON parsing for API response handling"
    ],
    importantNotes: [
      "The free OpenWeatherMap tier has rate limits (1000 calls/day)",
      "Requires active internet connection to function"
    ]
  },

  troubleshooting: [
    {
      problem: "ModuleNotFoundError: No module named 'requests'",
      cause: "The requests library was not installed or wrong Python version is being used",
      solution: "Run 'pip install requests' or 'pip3 install requests' if using Python 3"
    },
    {
      problem: "API returned 401 Unauthorized",
      cause: "Your OpenWeatherMap API key is missing, expired, or invalid",
      solution: "Check your .env file has the correct API key from https://openweathermap.org/api"
    },
    {
      problem: "City not found error",
      cause: "The city name might be misspelled or not recognized by OpenWeatherMap",
      solution: "Try using the city name exactly as it appears on openweathermap.org, or include country code like 'London,UK'"
    }
  ],

  notes: "This code was AI-generated from the user request: 'Build a CLI tool that shows weather data'. Created with Claude."
};
```

## Output: Rendered Markdown

```markdown
# Weather CLI

> Real-time weather from the command line in seconds

A lightweight Python CLI tool that fetches real-time weather data from OpenWeatherMap. Just type a city name and get instant temperature, humidity, and conditions. Perfect for checking weather without opening a browser.

## ✨ Features

- **Real-time Data** — Fetches current weather conditions every time you run it
- **Multiple Cities** — Search weather for any city in the world
- **Temperature Units** — Display temperature in Celsius, Fahrenheit, or Kelvin

## 📦 Installation

### Prerequisites

- Python 3.8 or higher
- Internet connection
- OpenWeatherMap API key (free tier available)

### Setup

1. Clone the repository
   - Get a copy of the code on your computer
2. pip install -r requirements.txt
   - Install required dependencies (requests library)
3. cp .env.example .env && nano .env
   - Create config file and add your OpenWeatherMap API key

## 🚀 Usage

### Basic Usage

Get weather for any city with a simple command

```
python weather.py London
```

**Output:**

```
🌤️ London: 15°C, Partly Cloudy, Humidity: 65%
```

### Fahrenheit Units

Display temperature in Fahrenheit

```
python weather.py --units fahrenheit New York
```

**Output:**

```
🌞 New York: 59°F, Sunny, Humidity: 45%
```

### Multiple Cities

Check weather for multiple cities at once

```
python weather.py London Paris Tokyo
```

**Output:**

```
🌤️ London: 15°C, Partly Cloudy
🌞 Paris: 18°C, Sunny
🌧️ Tokyo: 22°C, Rainy
```

## 🏗️ Architecture

The app is built in three layers: a CLI argument parser that handles user input, a data fetcher that calls the OpenWeatherMap API, and a formatter that displays results beautifully with emoji icons and consistent spacing.

### File Structure

```
weather.py
├── main()
│   ├── parse_arguments()
│   ├── fetch_weather()
│   └── format_output()
├── api.py
│   └── get_weather_data(city, units)
└── utils.py
    └── format_temperature(temp, units)
```

### Files

- **weather.py** — Main entry point, argument parsing, and output formatting
- **api.py** — Handles API calls to OpenWeatherMap and error handling
- **.env.example** — Template for configuration with API key placeholder

### Design Decisions

- Used requests library for simple, clean HTTP calls instead of urllib
- Separated API logic from UI formatting for easier testing
- Store API key in .env file instead of hardcoding for security

## 🔧 Technical Details

### Dependencies

- **requests** (2.28.0) — HTTP client library for making API calls
- **python-dotenv** (0.20.0) — Load environment variables from .env file

### Key Algorithms / Patterns

- Simple string matching for city name lookup (linear search)
- JSON parsing for API response handling

### Important Notes

- The free OpenWeatherMap tier has rate limits (1000 calls/day)
- Requires active internet connection to function

## ❓ Troubleshooting

### ModuleNotFoundError: No module named 'requests'

**Cause:** The requests library was not installed or wrong Python version is being used

**Solution:** Run 'pip install requests' or 'pip3 install requests' if using Python 3

### API returned 401 Unauthorized

**Cause:** Your OpenWeatherMap API key is missing, expired, or invalid

**Solution:** Check your .env file has the correct API key from https://openweathermap.org/api

### City not found error

**Cause:** The city name might be misspelled or not recognized by OpenWeatherMap

**Solution:** Try using the city name exactly as it appears on openweathermap.org, or include country code like 'London,UK'

---

This code was AI-generated from the user request: 'Build a CLI tool that shows weather data'. Created with Claude.
```

---

## How It All Works Together

```typescript
// 1. Claude generates structured README via LLM
const readmeData = await structuredModel.invoke(prompt);
// Returns Readme object matching schema

// 2. Validate it matches schema
const validated = validateReadme(readmeData);

// 3. Render to markdown (deterministic)
const markdown = renderReadmeToMarkdown(validated);

// 4. Save to file
files.push({
  path: 'README.md',
  content: markdown,
  language: 'markdown'
});
```

✅ **What We've Built**:
- `readme-schema.ts` - Strict Zod schema for structure
- `readme-renderer.ts` - Deterministic markdown converter
- This example - Shows real input/output

The beauty: **Claude generates structured data**, **we validate it**, **we render it deterministically**. No hoping the formatting is correct!

---

## ✅ Progress

- [x] README Schema File Created
- [x] Render Function Created
- [ ] Update generateReadme() to use structured output
- [ ] Model Routing (add modelTier to CodePlanSchema)
- [ ] UI Redesign
- [ ] Deployment

**Next step**: Should I update `generateReadme()` in `generation-agent.ts` to use the new schema?