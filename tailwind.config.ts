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
  			// Vercel-like color scheme
  			background: {
  				DEFAULT: "hsl(var(--background))",
  				secondary: "hsl(var(--background-secondary))"
  			},
  			foreground: {
  				DEFAULT: "hsl(var(--foreground))",
  				secondary: "hsl(var(--foreground-secondary))"
  			},
  			border: {
  				DEFAULT: "hsl(var(--border))",
  				secondary: "hsl(var(--border-secondary))"
  			},
  			accent: {
  				DEFAULT: "hsl(var(--accent))",
  				foreground: "hsl(var(--accent-foreground))"
  			},
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
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
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
            },
            // Timetable specific colors - distinct and visually pleasing palette
            timetable: {
                blue: {
                    border: '#3b82f6', // blue-500
                    bg: '#dbeafe', // blue-100
                },
                purple: {
                    border: '#8b5cf6', // purple-500
                    bg: '#ede9fe', // purple-100
                },
                green: {
                    border: '#22c55e', // green-500
                    bg: '#dcfce7', // green-100
                },
                yellow: {
                    border: '#eab308', // yellow-500
                    bg: '#fef9c3', // yellow-100
                },
                orange: {
                    border: '#f97316', // orange-500
                    bg: '#ffedd5', // orange-100
                },
                teal: {
                    border: '#14b8a6', // teal-500
                    bg: '#ccfbf1', // teal-100
                },
                indigo: {
                    border: '#6366f1', // indigo-500
                    bg: '#e0e7ff', // indigo-100
                },
                pink: {
                    border: '#ec4899', // pink-500
                    bg: '#fce7f3', // pink-100
                },
                sky: {
                    border: '#0ea5e9', // sky-500
                    bg: '#e0f2fe', // sky-100
                },
                lime: {
                    border: '#84cc16', // lime-500
                    bg: '#ecfccb', // lime-100
                },
            },
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
    plugin(function({ addBase }) {
      addBase({
        ":root": {
          "--background": "0 0% 100%",
          "--background-secondary": "0 0% 98%",
          "--foreground": "240 10% 3.9%",
          "--foreground-secondary": "240 5% 34%",
          "--border": "240 5.9% 90%",
          "--border-secondary": "240 4.9% 83%",
          "--accent": "240 4.8% 95.9%",
          "--accent-foreground": "240 5.9% 10%",
          
          // Course status colors - Light mode
          "--status-completed-border": "142 76% 36%", // green-600
          "--status-completed-bg": "142 76% 95%", // Very light green
          "--status-in-progress-border": "217 91% 60%", // blue-500
          "--status-in-progress-bg": "214 95% 95%", // Very light blue
          "--status-failed-border": "0 84% 60%", // red-500
          "--status-failed-bg": "0 86% 97%", // Very light red
          "--status-planned-border": "270 76% 65%", // purple-500
          "--status-planned-bg": "270 76% 97%", // Very light purple
          "--status-exempted-border": "38 92% 50%", // yellow-500
          "--status-exempted-bg": "48 96% 94%", // Very light yellow
          "--status-default-border": "220 9% 40%", // Darker gray-500
          "--status-default-bg": "220 14% 96%", // Very light gray
          "--status-empty-border": "220 9% 65%", // gray-400
          "--status-empty-bg": "220 13% 91%", // gray-300
          "--status-empty-bg-alt": "0 0% 98%", // Very light gray for empty alternate
          
          // Phase divider - Light mode
          "--phase-divider": "220 13% 91%", // gray-300
          
          // Highlight effects - Light mode
          "--highlight-main-shadow": "0 0 25px rgba(66, 135, 245, 0.5), 0 0 10px rgba(255, 255, 255, 0.8)",
          "--highlight-prereq-shadow": "0 0 15px rgba(66, 135, 245, 0.4)",
          
          // Lighter variations for ghost box
          "--primary-lighter": "217 91% 85%",
          "--status-completed-lighter": "142 76% 85%",
          
          // Color opacity for backgrounds
          "--color-opacity": "0.2",
        },
        ".dark": {
          "--background": "240 10% 3.9%",
          "--background-secondary": "240 10% 5.9%",
          "--foreground": "0 0% 98%",
          "--foreground-secondary": "240 5% 64.9%",
          "--border": "240 3.7% 15.9%",
          "--border-secondary": "240 5.9% 23.9%",
          "--accent": "240 3.7% 15.9%",
          "--accent-foreground": "0 0% 98%",
          
          // Course status colors - Dark mode
          "--status-completed-border": "142 76% 45%", // green-500
          "--status-completed-bg": "142 75% 25%", // Solid dark green
          "--status-in-progress-border": "217 91% 60%", // blue-500
          "--status-in-progress-bg": "217 90% 25%", // Solid dark blue
          "--status-failed-border": "0 84% 60%", // red-500
          "--status-failed-bg": "0 80% 25%", // Solid dark red
          "--status-planned-border": "270 76% 65%", // purple-500
          "--status-planned-bg": "270 70% 25%", // Solid dark purple
          "--status-exempted-border": "38 92% 50%", // yellow-500
          "--status-exempted-bg": "38 90% 30%", // Solid dark yellow
          "--status-default-border": "220 9% 28%", // Even darker gray border
          "--status-default-bg": "220 10% 10%", // Even darker solid gray
          "--status-empty-border": "240 5% 30%", // darker gray
          "--status-empty-bg": "240 5% 15%", // Darker solid gray for empty
          "--status-empty-bg-alt": "0 0% 10%", // Very dark gray for empty alternate
          
          // Phase divider - Dark mode
          "--phase-divider": "240 3.7% 25%", // darker border
          
          // Highlight effects - Dark mode
          "--highlight-main-shadow": "0 0 25px rgba(59, 130, 246, 0.5), 0 0 10px rgba(30, 41, 59, 0.8)",
          "--highlight-prereq-shadow": "0 0 15px rgba(59, 130, 246, 0.4)",
          
          // Lighter variations for ghost box in dark mode
          "--primary-lighter": "217 91% 35%",
          "--status-completed-lighter": "142 76% 35%",
          
          // Color opacity for backgrounds in dark mode
          "--color-opacity": "0.3",
        }
      })
    }),
    plugin(function({ addComponents }) {
      const courseStatusComponents = {
        // Base course box styling
        '.course-box': {
          borderWidth: '2px',
          borderRadius: '0.375rem', // rounded
          padding: '0.5rem', // p-2
          transition: 'all 0.15s ease',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)', // Slightly better shadow
          position: 'absolute',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)', // Better shadow on hover
          },
          '&.draggable': {
            cursor: 'grab',
          },
          '&.draggable:active': {
            cursor: 'grabbing',
            transform: 'translateY(0)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)', // Less shadow when active
          },
        },
        
        // Status-specific course box styles
        '.course-completed': {
          borderColor: 'hsl(var(--status-completed-border))',
          backgroundColor: 'hsl(var(--status-completed-bg))',
        },
        '.course-in-progress': {
          borderColor: 'hsl(var(--status-in-progress-border))',
          backgroundColor: 'hsl(var(--status-in-progress-bg))',
        },
        '.course-failed': {
          borderColor: 'hsl(var(--status-failed-border))',
          backgroundColor: 'hsl(var(--status-failed-bg))',
        },
        '.course-planned': {
          borderColor: 'hsl(var(--status-planned-border))',
          backgroundColor: 'hsl(var(--status-planned-bg))',
        },
        '.course-exempted': {
          borderColor: 'hsl(var(--status-exempted-border))',
          backgroundColor: 'hsl(var(--status-exempted-bg))',
        },
        '.course-default': {
          borderColor: 'hsl(var(--status-default-border))',
          backgroundColor: 'hsl(var(--status-default-bg))',
        },
        '.course-empty': {
          borderColor: 'hsl(var(--status-empty-border))',
          borderStyle: 'dashed',
          backgroundColor: 'hsl(var(--status-empty-bg-alt))',
          cursor: 'default',
        },
        '.course-empty-alt': {
          borderColor: 'hsl(var(--status-empty-border))',
          backgroundColor: 'hsl(var(--status-empty-bg))',
          cursor: 'default',
        },
        
        // Progress visualizer ghost box styles
        '.ghost-box': {
          borderWidth: '2px',
          borderStyle: 'dashed',
          borderColor: 'hsl(var(--border))',
          borderRadius: '0.375rem', // rounded
          backgroundColor: 'hsl(var(--background))', // 100% opacity
          transition: 'all 0.2s ease',
          position: 'absolute',
          '&:hover': {
            backgroundColor: 'hsl(var(--background-secondary))', // 100% opacity
          },
          '&.drag-over': {
            borderColor: 'hsl(var(--primary))',
            backgroundColor: 'hsl(var(--primary-lighter, 217 91% 85%))', // Special light primary color
          },
          '&.drop-success': {
            borderColor: 'hsl(var(--status-completed-border))',
            backgroundColor: 'hsl(var(--status-completed-lighter, 142 76% 80%))', // Special light completed color
          }
        },
        
        // Phase divider line
        '.phase-divider': {
          position: 'absolute',
          top: '2.5rem', // top-10
          bottom: '0',
          width: '1px',
          backgroundColor: 'hsl(var(--phase-divider) / 0.4)',
        },
        
        // Timetable-specific styling
        '.timetable-cell': {
          borderWidth: '1px',
          padding: '0.25rem', // p-1
          position: 'relative',
          '&:hover': {
            backgroundColor: 'hsl(var(--accent))',
          },
        },
        
        // Timetable header and structure elements
        '.timetable-header': {
          backgroundColor: 'hsl(var(--background-secondary))',
          fontWeight: '600',
          padding: '0.75rem',
          textAlign: 'center',
          borderWidth: '1px',
          borderColor: 'hsl(var(--border))',
          color: 'hsl(var(--foreground))',
        },
        
        '.timetable-time-cell': {
          backgroundColor: 'hsl(var(--background-secondary))',
          fontWeight: '600',
          padding: '0.5rem',
          textAlign: 'center',
          fontSize: '0.75rem',
          borderWidth: '1px',
          borderColor: 'hsl(var(--border))',
          color: 'hsl(var(--foreground))',
        },
        
        '.timetable-container': {
          borderWidth: '1px',
          borderColor: 'hsl(var(--border))',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          backgroundColor: 'hsl(var(--background))',
          overflow: 'hidden',
        },
        
        '.timetable-table': {
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          backgroundColor: 'hsl(var(--background))',
        },
        
        // Timetable course styling
        '.timetable-course': {
          borderWidth: '2px',
          borderRadius: '0.375rem',
          padding: '0.25rem',
          cursor: 'pointer',
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        },
        
        // Timetable color classes
        '.timetable-blue': {
          borderColor: 'hsl(217 91% 60%)', // Fixed blue border
          backgroundColor: 'hsl(214 95% 93%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(217 91% 25%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-purple': {
          borderColor: 'hsl(270 76% 65%)', // Fixed purple border
          backgroundColor: 'hsl(270 76% 95%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(270 70% 30%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-green': {
          borderColor: 'hsl(142 76% 45%)', // Fixed green border
          backgroundColor: 'hsl(142 76% 90%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(142 70% 25%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-yellow': {
          borderColor: 'hsl(48 96% 50%)', // Fixed yellow border
          backgroundColor: 'hsl(48 96% 89%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(48 70% 35%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-orange': {
          borderColor: 'hsl(27 96% 60%)', // Fixed orange border
          backgroundColor: 'hsl(27 96% 89%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(27 70% 35%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-teal': {
          borderColor: 'hsl(173 80% 40%)', // Fixed teal border
          backgroundColor: 'hsl(173 80% 89%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(173 70% 30%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-indigo': {
          borderColor: 'hsl(239 84% 67%)', // Fixed indigo border
          backgroundColor: 'hsl(239 84% 94%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(239 70% 35%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-pink': {
          borderColor: 'hsl(331 86% 60%)', // Fixed pink border
          backgroundColor: 'hsl(331 86% 95%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(331 70% 30%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-sky': {
          borderColor: 'hsl(199 89% 48%)', // Fixed sky border
          backgroundColor: 'hsl(199 89% 94%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(199 70% 35%)', // Dark mode bg - 100% opacity
          },
        },
        '.timetable-lime': {
          borderColor: 'hsl(84 81% 44%)', // Fixed lime border
          backgroundColor: 'hsl(84 81% 89%)', // Light mode bg - 100% opacity
          '@media (prefers-color-scheme: dark)': {
            backgroundColor: 'hsl(84 70% 30%)', // Dark mode bg - 100% opacity
          },
        },
        
        // Course content styling
        '.course-id': {
          fontWeight: 'bold',
          fontSize: '0.75rem', // text-xs
          color: 'black', // Black text for light mode
          '.dark &': {
            color: 'white', // White text for dark mode
          }
        },
        '.course-name': {
          fontSize: '0.75rem', // text-xs
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#333333', // Dark gray for light mode
          '.dark &': {
            color: '#e5e5e5', // Light gray for dark mode
          }
        },
        '.course-selected': {
          ringWidth: '2px',
          ringColor: 'hsl(var(--ring))',
          ringOffsetWidth: '1px',
        },
        
        // Course Stats component styling
        '.stats-container': {
          width: '100%',
          borderRadius: '0.5rem',
          borderWidth: '1px',
          borderColor: 'hsl(var(--border))',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // shadow-sm
          overflow: 'hidden',
          backgroundColor: 'hsl(var(--card))'
        },
        
        '.stats-header': {
          padding: '0.75rem', // p-3
          fontWeight: '600', // font-semibold
          fontSize: '1.125rem', // text-lg
          borderBottomWidth: '1px',
          borderColor: 'hsl(var(--border))',
          backgroundColor: 'hsl(var(--background-secondary))',
          color: 'hsl(var(--foreground))'
        },
        
        '.stats-section': {
          marginBottom: '1.5rem', // mb-6
        },
        
        '.stats-grid': {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '0.5rem', // gap-2
        },
        
        '.stats-search': {
          width: '100%',
          paddingTop: '0.5rem', // py-2
          paddingBottom: '0.5rem',
          paddingLeft: '2.5rem', // pl-10
          paddingRight: '1rem', // pr-4
          borderWidth: '1px',
          borderColor: 'hsl(var(--border))',
          borderRadius: '0.375rem', // rounded-md
          fontSize: '0.875rem', // text-sm
          backgroundColor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          '&:focus': {
            outline: 'none',
            ringWidth: '2px',
            ringColor: 'hsl(var(--ring))', // ring-primary
            borderColor: 'hsl(var(--border-secondary))',
          },
          '&::placeholder': {
            color: 'hsl(var(--muted-foreground))',
          },
          transition: 'all 0.2s ease',
        },
        
        '.stats-search-icon': {
          position: 'absolute',
          left: '0.75rem', // left-3
          top: '0.625rem', // top-2.5
          color: 'hsl(var(--muted-foreground))', // text-muted-foreground
        },
        
        '.stats-course-card': {
          padding: '0.5rem', // p-2
          borderRadius: '0.375rem', // rounded
          borderWidth: '2px',
          fontSize: '0.75rem', // text-xs
          cursor: 'pointer',
          height: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          transition: 'box-shadow 0.2s ease',
          '&:hover': {
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // hover:shadow-sm
          },
        },
        
        '.stats-summary-card': {
          padding: '0.75rem', // p-3
          borderWidth: '1px',
          borderColor: 'hsl(var(--border))',
          borderRadius: '0.5rem', // rounded-lg
          backgroundColor: 'hsl(var(--background-secondary))',
          color: 'hsl(var(--foreground))'
        },
        
        '.stats-professor-card': {
          padding: '0.75rem', // p-3
          borderWidth: '1px',
          borderRadius: '0.5rem', // rounded-lg
          cursor: 'pointer',
          borderColor: 'hsl(var(--border))',
          backgroundColor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          '&:hover': {
            borderColor: 'hsl(var(--border-secondary))',
            backgroundColor: 'hsl(var(--background-secondary) / 0.3)',
          },
        },
        
        '.stats-professor-active': {
          borderColor: 'hsl(var(--primary))',
          backgroundColor: 'hsl(var(--background-secondary))'
        },
        
        '.stats-enrollment-bar': {
          width: '100%',
          backgroundColor: 'hsl(var(--border))', // bg-border
          borderRadius: '9999px', // rounded-full
          height: '0.375rem', // h-1.5
        },
        
        '.stats-enrollment-progress': {
          height: '100%',
          borderRadius: '9999px', // rounded-full
          backgroundColor: 'hsl(var(--primary))', // bg-primary
        },
      }
      
      addComponents(courseStatusComponents)
    })
  ],
};
export default config;
