import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: "class",
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
    plugin(function ({ addComponents }) {
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
          backgroundColor: 'hsl(var(--background))',
          '.dark &': {
            borderColor: 'hsl(240 5% 15%)', // More grayish border in dark mode
          },
        },
        '.course-empty': {
          borderColor: 'hsl(var(--status-empty-border))',
          borderStyle: 'dashed',
          backgroundColor: 'hsl(var(--background))',
          cursor: 'default',
          '.dark &': {
            borderColor: 'hsl(240 5% 26%)', // More grayish border in dark mode
          },
        },
        '.course-empty-alt': {
          borderColor: 'hsl(var(--status-empty-border))',
          backgroundColor: 'hsl(var(--background))',
          cursor: 'default',
          '.dark &': {
            borderColor: 'hsl(240 5% 26%)', // More grayish border in dark mode
          },
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
          backgroundColor: 'hsl(var(--phase-divider))',
          opacity: '0.8', // Higher opacity for better visibility
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
          borderColor: 'hsl(var(--timetable-blue) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-blue-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-blue-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-purple': {
          borderColor: 'hsl(var(--timetable-purple) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-purple-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-purple-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-green': {
          borderColor: 'hsl(var(--timetable-green) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-green-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-green-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-yellow': {
          borderColor: 'hsl(var(--timetable-yellow) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-yellow-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-yellow-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-orange': {
          borderColor: 'hsl(var(--timetable-orange) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-orange-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-orange-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-teal': {
          borderColor: 'hsl(var(--timetable-teal) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-teal-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-teal-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-indigo': {
          borderColor: 'hsl(var(--timetable-indigo) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-indigo-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-indigo-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-pink': {
          borderColor: 'hsl(var(--timetable-pink) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-pink-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-pink-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-sky': {
          borderColor: 'hsl(var(--timetable-sky) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-sky-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-sky-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
          },
        },
        '.timetable-lime': {
          borderColor: 'hsl(var(--timetable-lime) / 0.8)',
          backgroundColor: 'hsl(var(--timetable-lime-dark))',
          '&:hover': {
            backgroundColor: 'hsl(var(--timetable-lime-dark))',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.12)'
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
