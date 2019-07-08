function noise = perlin_noise(samples, gradients, octave_decay_factor)

if ( isempty(gradients) || isempty(samples) )
  noise = [];
  return;
end

if ( nargin < 3 )
  octave_decay_factor = 0.5;
else
  validateattributes( octave_decay_factor, {'double', 'single'}, {'scalar'} ...
    , mfilename, 'octave_decay_factor' );
end

try
  check_inputs( samples, gradients );
catch err
  throw( err );
end

samples(samples < 0) = 0;
samples(samples > 1) = 1;

num_dims = size( samples, 1 );
num_samples = size( samples, 2 );
num_octaves = numel( gradients );

num_adjacent_gradients = 2^num_dims;
adjacent_distances = zeros( 1, num_adjacent_gradients );

combination_indices = grid_indices_combinations( num_dims );
dimension_indices = generate_dimension_indices( num_dims, combination_indices );

noise = zeros( 1, num_samples );

for i = 1:num_samples
  octave_decay = 1;
  
  for j = 1:num_octaves
    curr_gradient = gradients{j};
    num_gradient_samples = size( curr_gradient, 2 );
    
    grid_relative_sample = samples(:, i) .* num_gradient_samples;
    grid_point = floor( grid_relative_sample );
    t = grid_relative_sample - grid_point;
    sample_point = grid_point + 1;
    
    adjacent_distances(:) = 0;
    
    for k = 1:num_adjacent_gradients
      adjacent_inds = combination_indices(:, k);
      sample_indices = sample_point + adjacent_inds;
      
      % wraparound
      sample_indices = mod( sample_indices-1, num_gradient_samples ) + 1;
      
      is_next = logical( adjacent_inds );
      sample_ts = t;
      sample_ts(is_next) = t(is_next)-1;
      
      use_inds = arrayfun( @(x) x, sample_indices, 'un', 0 );
      gradient_point = curr_gradient(:, use_inds{:});
      
      for h = 1:num_dims
        gradient_sample = gradient_point(h) * sample_ts(h);
        adjacent_distances(k) = adjacent_distances(k) + gradient_sample;
      end
    end
    
    t0s = default_smooth( 1-t );
    t1s = default_smooth( t );
    
    current_combs = combination_indices;
    use_combined = adjacent_distances;
      
    iter = num_adjacent_gradients / 2;
    k = 1;

    while ( iter >= 1 )
      tdim0 = current_combs(1, :) == 0;
      tdim1 = current_combs(1, :) == 1;

      rest_combs = grid_indices_combinations( num_dims-k );
      [num_remaining_dims, num_rest_combs] = size( rest_combs );

      remaining_ind = true( 1, size(use_combined, 2) );
      to_combine = zeros( 1, num_rest_combs );

      for h = 1:num_rest_combs
        ind0 = tdim0;
        ind1 = tdim1;

        remaining_ind(:) = true;

        for hh = 1:num_remaining_dims
          remaining_ind = remaining_ind & current_combs(hh+1, :) == rest_combs(hh, h);

          ind0 = ind0 & remaining_ind;
          ind1 = ind1 & remaining_ind;
        end

        grad0 = use_combined(ind0);
        grad1 = use_combined(ind1);

        to_combine(h) = grad0*t0s(k) + grad1*t1s(k);
      end

      iter = iter/2;
      k = k + 1;

      noise_result = use_combined;
      use_combined = to_combine;
      current_combs = rest_combs;
    end
    
    noise_result = noise_result(1)*t0s(num_dims) + noise_result(2)*t1s(num_dims);
    
    noise(i) = noise(i) + noise_result * octave_decay;
    octave_decay = octave_decay * octave_decay_factor;
  end
end

end

function inds = generate_dimension_indices(num_dims, combination_indices)

iter = 2^(num_dims-1);
i = 1;

inds = {};

while ( iter >= 1 )
  tdim0 = combination_indices(1, :) == 0;
  tdim1 = combination_indices(1, :) == 1;

  rest_combs = grid_indices_combinations( num_dims-i );
  [num_remaining_dims, num_rest_combs] = size( rest_combs );

  remaining_ind = true( 1, size(combination_indices, 2) );

  for h = 1:num_rest_combs
    ind0 = tdim0;
    ind1 = tdim1;

    remaining_ind(:) = true;

    for hh = 1:num_remaining_dims
      remaining_ind = remaining_ind & combination_indices(hh+1, :) == rest_combs(hh, h);

      ind0 = ind0 & remaining_ind;
      ind1 = ind1 & remaining_ind;
    end
    
    inds{end+1} = [ind0; ind1];
  end

  iter = iter/2;
  i = i + 1;

  combination_indices = rest_combs;
end

end

function t = default_smooth(t)
% http://staffwww.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf
t = 6.*t.^5 - 15.*t.^4 + 10.*t.^3;
end

function c = grid_indices_combinations(num_dims)

if ( num_dims == 0 )
  c = [];
  return;
end

% https://www.mathworks.com/matlabcentral/answers/412412-how-to-create-matrix-of-all-combinations

c = repmat( {[0, 1]}, 1, num_dims );
[c{:}] = ndgrid(c{:});
n = length(c);
c = reshape(cat(n+1, c{:}), [], n)';

end

function check_inputs(samples, gradients)

validateattributes( gradients, {'cell'}, {'vector'}, mfilename, 'gradients' );
validateattributes( samples, {'double', 'single'}, {'2d', 'nrows', size(gradients{1}, 1)} ...
  , mfilename, 'samples' );

end