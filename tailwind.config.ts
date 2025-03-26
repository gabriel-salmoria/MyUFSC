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
        // Base course box styling
        '.course-box': {
          borderWidth: '2px',
          borderRadius: '0.375rem', // rounded
          padding: '0.5rem', // p-2
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // shadow-sm
          position: 'absolute',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', // shadow-md
          },
          '&.draggable': {
            cursor: 'grab',
          },
          '&.draggable:active': {
            cursor: 'grabbing',
          },
        },
        
        // Status-specific course box styles
        '.course-completed': {
          borderColor: '#22c55e', // green-500
          backgroundColor: '#dcfce7', // green-100
        },
        '.course-in-progress': {
          borderColor: '#3b82f6', // blue-500 
          backgroundColor: '#dbeafe', // blue-100
        },
        '.course-failed': {
          borderColor: '#ef4444', // red-500
          backgroundColor: '#fee2e2', // red-100
        },
        '.course-planned': {
          borderColor: '#a855f7', // purple-500
          backgroundColor: '#f3e8ff', // purple-100
        },
        '.course-exempted': {
          borderColor: '#eab308', // yellow-500
          backgroundColor: '#fef9c3', // yellow-100
        },
        '.course-default': {
          borderColor: '#6b7280', // gray-500
          backgroundColor: '#f3f4f6', // gray-100
        },
        '.course-empty': {
          borderColor: '#9ca3af', // gray-400
          borderStyle: 'dashed',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          cursor: 'default',
        },
        '.course-empty-alt': {
          borderColor: '#d1d5db', // gray-300
          backgroundColor: 'rgba(209, 213, 219, 0.3)',
          cursor: 'default',
        },
        
        // Progress visualizer ghost box styles
        '.ghost-box': {
          borderWidth: '2px',
          borderStyle: 'dashed',
          borderColor: '#9ca3af', // gray-400
          borderRadius: '0.375rem', // rounded
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          transition: 'all 0.2s ease',
          position: 'absolute',
          '&:hover': {
            backgroundColor: 'rgba(243, 244, 246, 0.5)', // gray-50/50
          },
          '&.drag-over': {
            borderColor: '#3b82f6', // blue-400
            backgroundColor: 'rgba(219, 234, 254, 0.5)', // blue-50/50
          },
          '&.drop-success': {
            borderColor: '#22c55e', // green-500
            backgroundColor: 'rgba(220, 252, 231, 0.5)', // green-50/50
          }
        },
        
        // Phase divider line
        '.phase-divider': {
          position: 'absolute',
          top: '2.5rem', // top-10
          bottom: '0',
          width: '1px',
          backgroundColor: '#d1d5db', // bg-gray-300
        },
        
        // Timetable-specific styling
        '.timetable-cell': {
          borderWidth: '1px',
          padding: '0.25rem', // p-1
          position: 'relative',
          '&:hover': {
            backgroundColor: 'rgba(243, 244, 246, 0.5)', // bg-gray-50/50
          },
        },
        
        // Timetable header and structure elements
        '.timetable-header': {
          backgroundColor: '#f3f4f6', // bg-gray-100
          fontWeight: '600', // font-semibold
          padding: '0.75rem', // p-3
          textAlign: 'center',
          borderWidth: '1px',
          borderColor: '#e5e7eb', // border-gray-200
        },
        
        '.timetable-time-cell': {
          backgroundColor: '#f9fafb', // bg-gray-50
          fontWeight: '600', // font-semibold
          padding: '0.5rem', // p-2
          textAlign: 'center',
          fontSize: '0.75rem', // text-xs
          borderWidth: '1px',
          borderColor: '#e5e7eb', // border-gray-200
        },
        
        '.timetable-container': {
          borderWidth: '1px',
          borderColor: '#e5e7eb', // border-gray-200
          borderRadius: '0.5rem', // rounded-lg
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // shadow-sm
          backgroundColor: 'white',
          overflow: 'hidden',
        },
        
        '.timetable-table': {
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
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
        
        // Course content styling
        '.course-id': {
          fontWeight: 'bold',
          fontSize: '0.75rem', // text-xs
        },
        '.course-name': {
          fontSize: '0.75rem', // text-xs
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '.course-selected': {
          ringWidth: '2px',
          ringColor: '#3b82f6', // ring-blue-500
        },
        
        // Course Stats component styling
        '.stats-container': {
          width: '100%',
          borderRadius: '0.5rem',
          borderWidth: '1px',
          borderColor: '#e5e7eb', // border-gray-200
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // shadow-sm
          overflow: 'hidden',
        },
        
        '.stats-header': {
          padding: '0.75rem', // p-3
          fontWeight: '600', // font-semibold
          fontSize: '1.125rem', // text-lg
          borderBottomWidth: '1px',
          borderColor: '#e5e7eb', // border-gray-200
          backgroundColor: '#f3f4f6', // bg-gray-100
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
          borderRadius: '0.375rem', // rounded-md
          fontSize: '0.875rem', // text-sm
          '&:focus': {
            outline: 'none',
            ringWidth: '2px',
            ringColor: '#3b82f6', // ring-blue-500
          },
          transition: 'all 0.2s ease',
        },
        
        '.stats-search-icon': {
          position: 'absolute',
          left: '0.75rem', // left-3
          top: '0.625rem', // top-2.5
          color: '#9ca3af', // text-gray-400
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
          borderRadius: '0.5rem', // rounded-lg
          backgroundColor: '#f9fafb', // bg-gray-50
        },
        
        '.stats-professor-card': {
          padding: '0.75rem', // p-3
          borderWidth: '1px',
          borderRadius: '0.5rem', // rounded-lg
          cursor: 'pointer',
          borderColor: '#e5e7eb', // border-gray-200
          '&:hover': {
            borderColor: '#d1d5db', // border-gray-300
          },
        },
        
        '.stats-professor-active': {
          borderColor: '#6b7280', // border-gray-500
          backgroundColor: '#f3f4f6', // bg-gray-100
        },
        
        '.stats-enrollment-bar': {
          width: '100%',
          backgroundColor: '#e5e7eb', // bg-gray-200
          borderRadius: '9999px', // rounded-full
          height: '0.375rem', // h-1.5
        },
        
        '.stats-enrollment-progress': {
          height: '100%',
          borderRadius: '9999px', // rounded-full
          backgroundColor: '#3b82f6', // bg-blue-500
        },
      }
      
      addComponents(courseStatusComponents)
    })
  ],
};
export default config;
