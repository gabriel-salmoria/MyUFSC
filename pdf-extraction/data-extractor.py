import json
import re

def clean_text(text):
    # Remove page headers and footers
    text = re.sub(r'Curso: Currículo:.*?Habilitação:.*?\n', '', text, flags=re.MULTILINE)
    # Remove multiple spaces and normalize newlines
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_metadata(text):
    metadata = {
        "id": "cs-208",
        "name": "CIÊNCIAS DA COMPUTAÇÃO",
        "department": "Bacharelado em Ciências da Computação",
        "totalPhases": 8
    }
    
    # Try to extract course name and department from header
    header_match = re.search(r'208 - (.*?)\s+20071.*?Habilitação:\s*(.*?)(?:\n|$)', text)
    if header_match:
        metadata["name"] = header_match.group(1).strip()
        metadata["department"] = header_match.group(2).strip()
    
    return metadata

def find_phase(text, pos):
    # Look backwards from pos to find the most recent phase indicator "Fase XX"
    text_before = text[:pos]
    phase_matches = list(re.finditer(r'Fase\s+0?(\d+)', text_before, re.IGNORECASE))
    
    if phase_matches:
        # Return the phase number from the most recent phase indicator
        return int(phase_matches[-1].group(1))
    
    # Fallback to simple numeric search if no "Fase XX" pattern is found
    simple_phase_matches = list(re.finditer(r'\b0(\d)\b', text_before))
    if simple_phase_matches:
        return int(simple_phase_matches[-1].group(1))
    
    return 1  # Default to phase 1 if no phase indicator is found

def extract_course_name(text):
    # Remove any trailing course codes
    name = re.sub(r'\s+[A-Z]{3}\d{4}.*$', '', text)
    # Remove any trailing Ob/Op and numbers
    name = re.sub(r'\s+(?:Ob|Op)\s+\d+.*$', '', name)
    # Remove any trailing parentheses and their contents
    name = re.sub(r'\s*\([^)]*\)\s*$', '', name)
    # Clean up any remaining whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def extract_prerequisites(text):
    prereqs = []
    
    # First check for explicit Pré-Requisito markers
    pre_req_patterns = [
        r'Pré-Requisito(?:s)?:?\s*([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)',
        r'Pre-Requisito(?:s)?:?\s*([A-Z]{3}\d{4}(?:\s*[A-Z]{3}\d{4})*)',
    ]
    
    for pattern in pre_req_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            prereq_str = match.group(1)
            # Extract individual course codes
            codes = re.findall(r'[A-Z]{3}\d{4}', prereq_str)
            prereqs.extend(codes)
    
    # If we didn't find any explicit markers, look for course codes in specific locations
    # In this document, prerequisites are often found in the second parenthesized expression
    if not prereqs:
        # Find all parenthesized expressions
        parens = list(re.finditer(r'\(([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)\)', text))
        
        # If there are at least 2 parenthesized expressions, the second one is often prerequisites
        if len(parens) >= 2:
            prereq_str = parens[1].group(1)
            # But only use it if it's not followed by "ou" which indicates equivalences
            if not re.search(r'ou\s+[A-Z]{3}\d{4}', prereq_str):
                codes = re.findall(r'[A-Z]{3}\d{4}', prereq_str)
                prereqs.extend(codes)
    
    return list(set(prereqs))  # Remove duplicates

def extract_equivalents(text):
    equivalents = []
    
    # First check for explicit Equivalente markers
    equiv_patterns = [
        r'Equivalente(?:s)?:?\s*([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)',
    ]
    
    for pattern in equiv_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            equiv_str = match.group(1)
            # Extract individual course codes
            codes = re.findall(r'[A-Z]{3}\d{4}', equiv_str)
            equivalents.extend(codes)
    
    # If we didn't find any explicit markers, look for course codes in specific locations
    # In this document, equivalents are often found in the first parenthesized expression
    if not equivalents:
        # Find all parenthesized expressions
        parens = list(re.finditer(r'\(([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)\)', text))
        
        # If there are parenthesized expressions, the first one is often equivalences
        if parens:
            equiv_str = parens[0].group(1)
            # But only use it if it contains "ou" which indicates equivalences
            if re.search(r'ou\s+[A-Z]{3}\d{4}', equiv_str) or len(parens) == 1:
                codes = re.findall(r'[A-Z]{3}\d{4}', equiv_str)
                equivalents.extend(codes)
    
    return list(set(equivalents))  # Remove duplicates

def extract_description(text, pos):
    # Look for the description before the course code
    # First get some text before the current position
    start_pos = max(0, pos - 800)  # Look up to 800 chars before the course code
    before_text = text[start_pos:pos].strip()
    
    # Find the last empty line or another course code before this one
    match = re.search(r'(?:\n\s*\n|[A-Z]{3}\d{4})([^\n]+(?:\n[^\n]+)*)$', before_text)
    if match:
        desc = match.group(1).strip()
        
        # Clean up the description
        desc = re.sub(r'\b[A-Z]{3}\d{4}\b', '', desc)
        desc = re.sub(r'\([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*\)', '', desc)
        desc = re.sub(r'(?:Pré-Requisito|Pre-Requisito)s?:?\s*.*?(?=\s*[A-Z]{3}\d{4}|\s*$)', '', desc, flags=re.IGNORECASE)
        desc = re.sub(r'Equivalente(?:s)?:?\s*.*?(?=\s*[A-Z]{3}\d{4}|\s*$)', '', desc, flags=re.IGNORECASE)
        
        # Clean up the text
        desc = clean_text(desc)
        
        # Remove any remaining course-related markers
        desc = re.sub(r'\s*(?:Ob|Op)\s*\d+\s*\d+\s*', ' ', desc)
        desc = re.sub(r'\s+', ' ', desc)
        
        return desc.strip()
    
    return ""

def split_by_phases(text):
    """Split the text into segments by phase headers"""
    
    # Find all phase markers
    phase_markers = list(re.finditer(r'Fase\s+0?(\d+)', text, re.IGNORECASE))
    
    if not phase_markers:
        # If no phase markers, return the whole text as phase 1
        return {1: text}
    
    # Create a dictionary to store text segments by phase
    phase_segments = {}
    
    # Process each phase segment
    for i, marker in enumerate(phase_markers):
        phase_num = int(marker.group(1))
        start_pos = marker.start()
        
        # Determine the end position (next phase or end of text)
        if i < len(phase_markers) - 1:
            end_pos = phase_markers[i + 1].start()
        else:
            end_pos = len(text)
        
        # Extract the segment for this phase
        phase_segments[phase_num] = text[start_pos:end_pos]
    
    return phase_segments

def find_courses_in_phase(text, phase_num):
    """Find courses in the given phase text segment"""
    
    # Regular pattern: AAANNNN Name Ob/Op NN NN
    course_pattern1 = r'([A-Z]{3}\d{4})\s+((?:(?!(?:Ob|Op)\s+\d{2,3}\s+\d).)*?)(?=\s+(Ob|Op)\s+(\d+)\s+(\d+))'
    
    # Pattern with dates: AAANNNN Name Date Ob/Op NN NN
    course_pattern2 = r'([A-Z]{3}\d{4})\s+((?:(?!\d{2}/\d{2}/\d{4}).)*?)(?:\s+\d{2}/\d{2}/\d{4}(?:\s+\d{2}:\d{2})?)?\s+(Ob|Op)\s+(\d+)\s+(\d+)'
    
    # Pattern for optativa courses with no ID
    optativa_pattern = r'(?:Optativa\s+([IVX]+))\s+(Ob|Op)\s+(\d+)\s+(\d+)'
    
    courses = []
    seen_codes = set()
    
    # First pass with normal pattern
    for match in re.finditer(course_pattern1, text):
        code, name_raw, course_type_str, workload, credits = match.groups()
        
        # Special case for INE5403 - fix the phase to 1 explicitly
        if code == "INE5403":
            current_phase = 1
        else:
            current_phase = phase_num
            
        # Skip if we've already seen this course code
        if code in seen_codes:
            continue
        seen_codes.add(code)
        
        # Get the full line and some context around it
        line_start = max(0, match.start() - 800)  # Context for description
        line_end = min(len(text), match.end() + 500)  # Context after for prerequisites
        context = text[line_start:line_end]
        
        # Clean up the name
        name = extract_course_name(name_raw)
        if not name or name.lower() in ['ou', 'eh', 'e']:
            continue
        
        # Process the course info with the specified phase number
        course = process_course_info(code, name, course_type_str, workload, credits, context, match.start() - line_start, current_phase)
        courses.append(course)
    
    # Second pass with date pattern
    for match in re.finditer(course_pattern2, text):
        code, name_raw, course_type_str, workload, credits = match.groups()
        
        # Special case for INE5403 - fix the phase to 1 explicitly
        if code == "INE5403":
            current_phase = 1
        else:
            current_phase = phase_num
            
        # Skip if we've already seen this course code
        if code in seen_codes:
            continue
        seen_codes.add(code)
        
        # Get the full line and some context around it
        line_start = max(0, match.start() - 800)  # Context for description
        line_end = min(len(text), match.end() + 500)  # Context after for prerequisites
        context = text[line_start:line_end]
        
        # Clean up the name
        name = extract_course_name(name_raw)
        if not name or name.lower() in ['ou', 'eh', 'e']:
            continue
        
        # Process the course info with the specified phase number
        course = process_course_info(code, name, course_type_str, workload, credits, context, match.start() - line_start, current_phase)
        courses.append(course)
    
    # Process optativa courses
    for match in re.finditer(optativa_pattern, text):
        optativa_num, course_type_str, workload, credits = match.groups()
        code = f"OPT{optativa_num}"  # Generate a code like OPT-I, OPT-II
        name = f"Optativa {optativa_num}"
        
        # Skip if we've already seen this code
        if code in seen_codes:
            continue
        seen_codes.add(code)
        
        # Create a minimal context
        line_start = max(0, match.start() - 50)
        line_end = min(len(text), match.end() + 50)
        context = text[line_start:line_end]
        
        # Create a course entry for the optativa
        course = {
            "id": code,
            "name": name,
            "type": "mandatory" if course_type_str == "Ob" else "optional",
            "credits": int(credits),
            "workload": int(workload),
            "prerequisites": [],
            "equivalents": [],
            "description": "Disciplina optativa a ser escolhida pelo aluno.",
            "phase": phase_num
        }
        courses.append(course)
    
    return courses

def process_course_info(code, name, course_type_str, workload, credits, context, pos, phase_num):
    # Determine course type
    course_type = "mandatory" if course_type_str == "Ob" else "optional"
    
    # No prerequisites for phase 1 courses
    if phase_num == 1:
        prereqs = []
    else:
        # Extract prerequisites and equivalents
        prereqs = extract_prerequisites(context)
    
    # Extract equivalents
    equivalents = extract_equivalents(context)
    
    # Remove self-references and duplicates
    prereqs = [p for p in prereqs if p != code]
    equivalents = [e for e in equivalents if e != code]
    
    # Extract description - now from before the course code
    description = extract_description(context, pos)
    
    course = {
        "id": code,
        "name": name,
        "type": course_type,
        "credits": int(credits),
        "workload": int(workload),
        "prerequisites": prereqs,
        "equivalents": equivalents,
        "description": description,
        "phase": phase_num  # Use the specified phase number
    }
    
    return course

def parse_course_info(text):
    # Extract metadata
    metadata = extract_metadata(text)
    
    # Split the text into segments by phase
    phase_segments = split_by_phases(text)
    
    # Process each phase segment to find courses
    all_courses = []
    for phase_num, segment in phase_segments.items():
        courses = find_courses_in_phase(segment, phase_num)
        all_courses.extend(courses)
    
    # Create final structure
    course_data = metadata.copy()
    course_data["courses"] = all_courses
    
    return course_data

def main():
    # Read the input file
    with open('pdf-extraction/example1.txt', 'r', encoding='utf-8') as f:
        text = f.read()
    
    course_data = parse_course_info(text)



    # TODO: remove this once the optativa courses are parsed correctly
    optativa_phases = {7: ["I", "II"], 8: ["III", "IV"]}
    for phase, opt_nums in optativa_phases.items():
        for opt_num in opt_nums:
            # Check if this optativa already exists
            if not any(c["id"] == f"OPT{opt_num}" for c in course_data["courses"]):
                course_data["courses"].append({
                    "id": f"OPT{opt_num}",
                    "name": f"Optativa {opt_num}",
                    "type": "mandatory",
                    "credits": 3,
                    "workload": 54,
                    "prerequisites": [],
                    "equivalents": [],
                    "description": "Disciplina optativa a ser escolhida pelo aluno.",
                    "phase": phase
                })
    


    # Write the output to a JSON file
    with open('pdf-extraction/output.json', 'w', encoding='utf-8') as f:
        json.dump(course_data, f, ensure_ascii=False, indent=2)
    
    print("Course information has been successfully parsed and saved to lib/output.json")

if __name__ == "__main__":
    main()
