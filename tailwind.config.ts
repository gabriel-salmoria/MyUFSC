import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
            // New course status colors
            courseStatus: {
                completed: {
                    border: '#22c55e', // green-500
                    bg: '#dcfce7', // green-100
                },
                inProgress: {
                    border: '#3b82f6', // blue-500
                    bg: '#dbeafe', // blue-100
                },
                failed: {
                    border: '#ef4444', // red-500
                    bg: '#fee2e2', // red-100
                },
                planned: {
                    border: '#a855f7', // purple-500
                    bg: '#f3e8ff', // purple-100
                },
                exempted: {
                    border: '#eab308', // yellow-500
                    bg: '#fef9c3', // yellow-100
                },
                default: {
                    border: '#6b7280', // gray-500
                    bg: '#f3f4f6', // gray-100
                },
            }
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(function({ addComponents }) {
      const courseStatusComponents = {
        '.course-completed': {
          borderColor: '#22c55e', // green-500
          backgroundColor: '#dcfce7', // green-100
          borderWidth: '2px',
        },
        '.course-in-progress': {
          borderColor: '#3b82f6', // blue-500
          backgroundColor: '#dbeafe', // blue-100
          borderWidth: '2px',
        },
        '.course-failed': {
          borderColor: '#ef4444', // red-500
          backgroundColor: '#fee2e2', // red-100
          borderWidth: '2px',
        },
        '.course-planned': {
          borderColor: '#a855f7', // purple-500
          backgroundColor: '#f3e8ff', // purple-100
          borderWidth: '2px',
        },
        '.course-exempted': {
          borderColor: '#eab308', // yellow-500
          backgroundColor: '#fef9c3', // yellow-100
          borderWidth: '2px',
        },
        '.course-default': {
          borderColor: '#6b7280', // gray-500
          backgroundColor: '#f3f4f6', // gray-100
          borderWidth: '2px',
        },
        '.course-empty': {
          borderColor: '#9ca3af', // gray-400
          borderStyle: 'dashed',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderWidth: '2px',
        },
        '.course-empty-alt': {
          borderColor: '#d1d5db', // gray-300
          backgroundColor: 'rgba(209, 213, 219, 0.3)',
          borderWidth: '2px',
        },
      }
      
      addComponents(courseStatusComponents)
    })
  ],
};
export default config;
