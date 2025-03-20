import re
import os

def clean_text_file(input_path, output_path):
    """
    Clean a curriculum text file by removing headers, footers, dates,
    and other redundant information to make it easier to parse.
    Maintains original spacing and empty lines for structure.
    
    Args:
        input_path: Path to the input text file
        output_path: Path to save the cleaned text file
    """
    # Read the input file
    with open(input_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Initialize variables for processing
    cleaned_lines = []
    prev_line = ""
    in_course_codes = False  # Flag to track if we're in a course codes section
    in_course_info = False  # Flag to track if we're in a course information section
    just_closed_course_codes = False  # Flag to track if we just closed a course codes section
    
    # Headers and patterns to skip
    skip_patterns = [
        "CURRÍCULO DO CURSO", 
        "Curso:", 
        "Currículo:", 
        "Habilitação:", 
        "SeTIC",
        "Página:",
        "Superintendência",
        "00:02",
        "Tipo",
        "H/A",
        "Aulas",
        "Equivalentes",
        "Pré-Requisito",
        "Conjunto",
        "Pré CH",
        "Disciplina",
        "Carga horária optativa"
    ]
    
    # Process each line
    for i, line in enumerate(lines):
        # Keep empty lines as they are
        if not line.strip():
            cleaned_lines.append(line)
            continue
            
        # Skip headers and footers
        if any(pattern in line for pattern in skip_patterns):
            continue
            
        # Skip dates and timestamps
        if re.search(r'\d{2}/\d{2}/\d{4}', line):
            continue
            
        # Skip course number lines (e.g. "208 - ANY COURSE NAME")
        if re.match(r'^\d{3}\s*-\s*', line.strip()):
            continue
            
        # Check if we're entering a course codes section (starts with parenthesis)
        if re.match(r'^\s*\(', line.strip()):
            in_course_codes = True
            cleaned_lines.append(line)
            continue
            
        # Check if we're exiting a course codes section (ends with parenthesis)
        if in_course_codes and re.match(r'.*\)\s*$', line.strip()):
            in_course_codes = False
            just_closed_course_codes = True
            cleaned_lines.append(line)
            continue
            
        # If we're in a course codes section, keep the line
        if in_course_codes:
            cleaned_lines.append(line)
            continue
            
        # Skip trailing "ou" or "eh" lines after course codes section
        if just_closed_course_codes and re.match(r'^\s*(ou|eh)\s*$', line.strip(), re.IGNORECASE):
            just_closed_course_codes = False
            continue
            
        # Check if we're entering a course information section (starts with a course code)
        if re.match(r'^[A-Z]{3}\d{4}', line.strip()):
            in_course_info = True
            cleaned_lines.append(line)
            continue
            
        # If we're in a course information section, keep the line
        if in_course_info:
            cleaned_lines.append(line)
            continue
            
        # Skip standalone course codes (only when not in a course codes section or course info)
        if not in_course_codes and not in_course_info and re.match(r'^\s*[A-Z]{3}\d{4}\s*$', line.strip()):
            continue
            
        # Skip lines that have "Reconhecimento", "Portaria", "Parecer"
        if any(pattern in line for pattern in ["Reconhecimento", "Portaria", "Parecer", "publicado"]):
            continue
            
        # Skip repeated phase markers (e.g. "Fase 01") if the next line is empty
        if re.match(r'^Fase\s+\d+\s*$', line.strip()) and (i+1 < len(lines) and not lines[i+1].strip()):
            continue
            
        # Skip standalone "ou" or "eh" lines (only when not in course info)
        if not in_course_info and re.match(r'^\s*(ou|eh)\s*$', line.strip(), re.IGNORECASE):
            continue
            
        # Skip phase load hours lines (e.g. "Carga horária optativa da sétima fase = 126 HA")
        if re.match(r'^Carga horária optativa da .* fase = \d+ HA$', line.strip()):
            continue
            
        # Only add the line if it's not the same as the previous line
        if line != prev_line:
            # Keep the original line with its spacing
            cleaned_lines.append(line)
            prev_line = line
    
    # Write the cleaned text to the output file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.writelines(cleaned_lines)
    
    print(f"Cleaned text saved to {output_path}")

if __name__ == "__main__":
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # File paths in the same directory as the script
    input_path = os.path.join(script_dir, 'example.txt')
    output_path = os.path.join(script_dir, 'example1.txt')
    clean_text_file(input_path, output_path) 